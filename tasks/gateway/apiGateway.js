"use strict";

let aws = require("aws-sdk"),
    apiGateway = new aws.APIGateway({ apiVersion: "2015-07-09" }),
    lambdaTask = require("../lambda"),
    gatewayIntegration = require("./aws_apiGateway"),
    functionIntegration = require("./integration"),
    functionResponse = require("./response");

function apiGatewayTask(task, configuration) {
    let existingFunctions = null;
    return lambdaTask.AllFunctions()
        .then((allFunctions) => {
            existingFunctions = allFunctions;
            return allExistingApis();
        })
        .then((existingApis) => {
            return retrieveOrCreateApplicationApi(existingApis, configuration);
        })
        .then((apiId) => {
            global.log.Trace(`Using API ID: ${apiId}`);

            return existingApiResources(apiId);
        })
        .then((api) => {
            return createMappings(task, api.apiId, api.existingResources, existingFunctions, configuration)
                .then(() => {
                    return api;
                });
        })
        .then((api) => {
            return aliasNonEndpointFunctions(task, existingFunctions, configuration)
                .then(() => {
                    return api;
                })
                ;
        })
        .then((api) => {
            return pushToStage(task, api, configuration);
        })
        ;
}

function allExistingApis() {
    return new Promise((resolve, reject) => {
        apiGateway.getRestApis(null, (err, data) => {
            if (!!err)
                reject(err);
            else {
                global.log.Info(`Found ${data.items.length} existing APIs`);
                global.log.Debug(data);

                resolve(data);
            }
        })
    })
}

function retrieveOrCreateApplicationApi(existingApis, configuration) {
    let foundApi = existingApis.items.filter((api) => { return api.name.toLowerCase() == configuration.applicationName.toLowerCase(); });
    if (foundApi.length > 0)
        return foundApi[0].id;
    else
        return new Promise((resolve, reject) => {
            apiGateway.createRestApi({ name: configuration.applicationName }, (err, data) => {
                if (!!err)
                    reject(err);
                else
                    resolve(data.id);
            });
        });
}

function existingApiResources(apiId, position) {
    return new Promise((resolve, reject) => {
        let resourcesToGet = new (function() {
            this.restApiId = apiId;
            if (!!position)
                this.position = position;
        })();

        apiGateway.getResources(resourcesToGet, (err, data) => {
            if (!!err)
                reject(err);
            else {
                global.log.Trace("API Resources: ", JSON.stringify(data));

                if (!!data.position) {
                    let foundResources = data.items;

                    existingApiResources(apiId, data.position)
                        .then((additionalData) => {
                            foundResources = foundResources.concat(additionalData.existingResources.items);

                            resolve({ apiId: apiId, existingResources: { items: foundResources } });
                        })
                        .catch((err) => {
                            reject(err);
                        })
                        ;
                } else
                    resolve({ apiId: apiId, existingResources: data});
            }
        })
    });
}

function createMappings(task, apiId, existingResources, existingFunctions, configuration) {
    // Work off of a copy of the endpoints array
    let endpointsToProcess = !!task.endpoints ? task.endpoints.filter(() => { return true; }) : [];

    return processEndpoints(endpointsToProcess, task, apiId, existingResources, existingFunctions, configuration);
}

function aliasNonEndpointFunctions(task, existingFunctions, configuration) {
    if (!!task.aliasNonEndpoints) {
        let functionsToAlias = task.aliasNonEndpoints.filter(() => { return true; });
        return processNonEndpoints(functionsToAlias, task, existingFunctions, configuration);
    } else
        return Promise.resolve();
}

function processNonEndpoints(remainingFunctions, task, existingFunctions, configuration) {
    if (remainingFunctions.length > 0) {
        let functionToAlias = remainingFunctions.shift();

        return gatewayIntegration.Method_CreateLambdaVersion(configuration.applicationName, functionToAlias.functionName, configuration.awsRegion, existingFunctions, task)
            .then(() => {
                return processNonEndpoints(remainingFunctions, task, existingFunctions, configuration);
            })
            ;
    } else
        return Promise.resolve();
}

function processEndpoints(remainingEndpoints, task, apiId, existingResources, existingFunctions, configuration) {
    if (remainingEndpoints.length > 0) {
        let endpoint = remainingEndpoints.shift();

        return getResource(endpoint, apiId, existingResources)
            .then((resource) => {
                return addMethod(endpoint, resource, apiId);
            })
            .then((method) => {
                return lambdaIntegration(endpoint, method.resource, method.method, apiId, existingFunctions, task, configuration);
            })
            .then((resourceChain) => {
                return methodResponse(endpoint, resourceChain, apiId, task);
            })
            .then((resourceChain) => {
                return integrationResponse(endpoint, resourceChain, apiId, task);
            })
            .then((resourceChain) => {
                return addCorsMethod(endpoint, resourceChain, apiId, task);
            })
            .then(() => {
                // Rate limit to keep from running over a TooManyRequests exception
                global.log.Info(`Waiting 1 second to rate-limit requests to AWS APIs (${remainingEndpoints.length} remaining to process)`);

                return new Promise((resolve, reject) => {
                    setTimeout(function() {
                        resolve();
                    }, 1000);
                })
            })
            .then(() => {
                return processEndpoints(remainingEndpoints, task, apiId, existingResources, existingFunctions, configuration);
            })
            ;
    } else
        return Promise.resolve(null);
}

function getResource(endpoint, apiId, existingResources) {
    return new Promise((resolve, reject) => {
        let foundParents = existingResources.items.filter((item) => {
            return (endpoint.path.search(new RegExp("^" + item.path, "i")) >= 0);
        });

        global.log.Info(`Endpoint "${endpoint.path}" running function "${endpoint.functionName}"`);
        global.log.Trace(endpoint);
        global.log.Debug(`Endpoint path parents found`, foundParents);

        let lowestParent = null;
        foundParents.forEach((parentItem) => {
            if (!lowestParent || (parentItem.path.length > lowestParent.path.length))
                lowestParent = parentItem;
        });

        global.log.Debug(`Lowest parent`, lowestParent);

        let createPath = endpoint.path.replace(new RegExp("^" + lowestParent.path, "i"), "");
        let createParts = createPath.length > 0 ? createPath.split("/") : [];
        global.log.Trace(`Path`, createPath, `to parts`, createParts);

        if ((createParts.length > 0) && (createParts[0].length == 0)) {
            createParts.shift();

            global.log.Debug(`Removed empty path part at [0]`);
        }

        // Create each missing part of the path as a new resource
        (function createPart(parentResource) {
            if (createParts.length > 0) {
                let pathPart = createParts.shift();

                let newResource = new (function() {
                    this.restApiId = apiId;
                    this.parentId = parentResource.id;
                    this.pathPart = pathPart;
                })();

                apiGateway.createResource(newResource, (err, data) => {
                    if (!!err) {
                        global.log.Error(err);
                        reject(err);
                    } else {
                        global.log.Debug(`New Resource Created`, data);
                        existingResources.items.push(data);
                        createPart(data);
                    }
                });
            } else {
                resolve(parentResource);
            }
        })(lowestParent);
    });
}

function addMethod(endpoint, resource, apiId) {
    global.log.Trace("Resource: ", resource);

    return removeMethod(endpoint, resource, apiId)
        .then(() => {
            return gatewayIntegration.Method_AddToResource(endpoint.method, resource, apiId, endpoint.headers, endpoint.parameters);
        })
        .then((methodCreation) => {
            return { resource: resource, method: methodCreation };
        });
}

function removeMethod(endpoint, resource, apiId) {
    return gatewayIntegration.Method_DeleteFromResource(endpoint.method, resource, apiId)
        .then(() => {
            return gatewayIntegration.Method_DeleteFromResource("OPTIONS", resource, apiId);
        });
}

function lambdaIntegration(endpoint, resource, method, apiId, lambdaFunctions, task, configuration) {
    return gatewayIntegration.Method_LambdaIntegrationRequest(
        method,
        endpoint.headers,
        endpoint.parameters,
        endpoint.endpointConfiguration,
        resource,
        apiId,
        configuration.applicationName,
        endpoint.functionName,
        configuration.awsRegion,
        configuration.awsAccountId,
        lambdaFunctions,
        task)
        .then((integration) => {
            return { integration:integration, method:method, resource: resource };
        });
}

function integrationResponse(endpoint, resourceChain, apiId, task) {
    let headers = null;

    // Add Access-Control-Allow-Origin header to the resource method
    if (!!task.cors && !!task.cors.origin)
        headers = [
            // Access-Control-Allow-Origin = the configured CORS origin
            { "name":"Access-Control-Allow-Origin", "value":task.cors.origin }
        ];

    return functionResponse.AddIntegrationResponse(resourceChain.method, resourceChain.resource, apiId, headers)
        .then((integrationResponse) => {
            resourceChain.integrationResponse = integrationResponse;
            return resourceChain;
        });
}

function methodResponse(endpoint, resourceChain, apiId, task) {
    let headers = null;

    // Add Access-Control-Allow-Origin header to the resource method
    if (!!task.cors && !!task.cors.origin)
        headers = [
            // Access-Control-Allow-Origin = the configured CORS origin
            { "name":"Access-Control-Allow-Origin" }
        ]

    return functionResponse.AddMethodResponse(resourceChain.resource, resourceChain.method, apiId, headers)
        .then((methodResponse) => {
            resourceChain.methodResponse = methodResponse;
            return resourceChain;
        });
}

function addCorsMethod(endpoint, resourceChain, apiId, task) {
    if (!task.cors)
        return null;
    else if (!task.cors.origin)
        throw `CORS configuration must define "origin". Use "*" for all origins`;
    else {
        // Create OPTIONS method
        return gatewayIntegration.Method_AddToResource("OPTIONS", resourceChain.resource, apiId)
            .then((optionsMethod) => {
                // Add integration of type "Mock" with application/json mapping of: {"statusCode": 200}
                return functionIntegration.Method_MockIntegrationRequest(optionsMethod, 200, resourceChain.resource, apiId)
                    .then((integrationRequest) => {
                        return optionsMethod;
                    });
            })
            .then((optionsMethod) => {
                // Add method response of 200 with empty response model

                    // Add headers to integration response
                    let headers = [
                        // Access-Control-Allow-Headers
                        { "name":"Access-Control-Allow-Headers" },
                        // Access-Control-Allow-Methods
                        { "name":"Access-Control-Allow-Methods" },
                        // Access-Control-Allow-Origin
                        { "name":"Access-Control-Allow-Origin" }
                    ];

                return functionResponse.AddMethodResponse(resourceChain.resource, optionsMethod, apiId, headers)
                    .then((methodResponse) => {
                        return optionsMethod;
                    });
            })
            .then((optionsMethod) => {
                // Add integration response of 200 with an empty application/json mapping template

                // Add headers to integration response
                // Configure to use AWS-necessary (Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token),
                //      and any defined in the endpoint
                let allowedHeaders = [ "Content-Type", "X-Amz-Date", "Authorization", "X-Api-Key", "X-Amz-Security-Token" ];
                if (!!endpoint.headers)
                    endpoint.headers.forEach((header) => {
                        allowedHeaders.push(header.name);
                    });

                let headers = [
                    // Access-Control-Allow-Headers = allowedHeaders
                    { "name":"Access-Control-Allow-Headers", "value": allowedHeaders.join(",") },
                    // Access-Control-Allow-Methods = 'OPTIONS,' and whatever the resource method is
                    { "name":"Access-Control-Allow-Methods", "value":([resourceChain.method.httpMethod, "OPTIONS"]).join(",") },
                    // Access-Control-Allow-Origin = the configured CORS origin
                    { "name":"Access-Control-Allow-Origin", "value":task.cors.origin }
                ];

                return functionResponse.AddIntegrationResponse(optionsMethod, resourceChain.resource, apiId, headers)
                    .then((integrationResponse) => {
                        return optionsMethod;
                    });
            })
            ;
    }
}

function pushToStage(task, api, configuration) {
    if (!task.stage)
        return null;
    else
        return gatewayIntegration.Deployment_Create(task.stage, api, configuration);
}

module.exports.Task = apiGatewayTask;
