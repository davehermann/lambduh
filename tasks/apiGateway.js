"use strict";

let aws = require("aws-sdk"),
    apiGateway = new aws.APIGateway({ apiVersion: "2015-07-09" }),
    lambdaTask = require("./lambda"),
    gatewayIntegration = require("./aws_apiGateway");

function apiGatewayTask(task, configuration) {
    let existingFunctions = null;
    return lambdaTask.AllFunctions()
        .then((allFunctions) => {
            existingFunctions = allFunctions;
            return allExistingApis();
        })
        .then((existingApis) => {
            return applicationApi(existingApis, configuration);
        })
        .then((apiId) => {
            return existingApiResources(apiId);
        })
        .then((api) => {
            return createMappings(task, api.apiId, api.existingResources, existingFunctions, configuration)
                .then(() => {
                    return api;
                });
        })
        .then((api) => {
            return pushToStage(task, api);
        })
        ;
}

function allExistingApis() {
    return new Promise((resolve, reject) => {
        apiGateway.getRestApis(null, (err, data) => {
            if (!!err)
                reject(err);
            else {
                console.log("Found APIs: ", data);
                resolve(data);
            }
        })
    })
}

function applicationApi(existingApis, configuration) {
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

function existingApiResources(apiId) {
    return new Promise((resolve, reject) => {
        apiGateway.getResources({ restApiId: apiId }, (err, data) => {
            if (!!err)
                reject(err);
            else {
                console.log("API Resources: ", JSON.stringify(data, null, 4));
                resolve({ apiId: apiId, existingResources: data});
            }
        })
    });
}

function createMappings(task, apiId, existingResources, existingFunctions, configuration) {
    let allMappings = [];

    task.endpoints.forEach((endpoint) => {
        let pEndpoint = getResource(endpoint, apiId, existingResources)
            .then((resource) => {
                return addMethod(endpoint, resource, apiId);
            })
            .then((method) => {
                return lambdaIntegration(endpoint, method.resource, method.method, apiId, existingFunctions, configuration);
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
            ;

        allMappings.push(pEndpoint);
    });

    return Promise.all(allMappings);
}

function getResource(endpoint, apiId, existingResources) {
    return new Promise((resolve, reject) => {
        let foundParents = existingResources.items.filter((item) => {
            return (endpoint.path.search(new RegExp("^" + item.path, "i")) >= 0);
        });

        console.log("Endpoint: ", endpoint, "Parents: ", foundParents);

        let lowestParent = null;
        foundParents.forEach((parentItem) => {
            if (!lowestParent || (parentItem.path.length > lowestParent.path.length))
                lowestParent = parentItem;
        });

        let createPath = endpoint.path.replace(new RegExp("^" + lowestParent.path, "i"), "");
        let createParts = createPath.length > 0 ? createPath.split("/") : [];
        console.log("Path: ", createPath, " to parts: ", createParts);

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
                        console.log(err);
                        reject(err);
                    } else {
                        console.log("New Resource: ", data);
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
    console.log("Resource: ", resource);

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

function lambdaIntegration(endpoint, resource, method, apiId, lambdaFunctions, configuration) {
    return gatewayIntegration.Method_LambdaIntegrationRequest(
        method,
        endpoint.headers,
        endpoint.parameters,
        resource,
        apiId,
        configuration.applicationName,
        endpoint.functionName,
        configuration.awsRegion,
        configuration.awsAccountId,
        lambdaFunctions)
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

    return gatewayIntegration.Method_AddIntegrationResponse(resourceChain.method, resourceChain.resource, apiId, headers)
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

    return gatewayIntegration.Method_AddMethodResponse(resourceChain.resource, resourceChain.method, apiId, headers)
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
                return gatewayIntegration.Method_MockIntegrationRequest(optionsMethod, 200, resourceChain.resource, apiId)
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

                return gatewayIntegration.Method_AddMethodResponse(resourceChain.resource, optionsMethod, apiId, headers)
                    .then((methodResponse) => {
                        return optionsMethod;
                    });
            })
            .then((optionsMethod) => {
                // Add integration response of 200 with an empty application/json mapping template

                // Add headers to integration response
                let headers = [
                    // Access-Control-Allow-Headers = 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
                    { "name":"Access-Control-Allow-Headers", "value":"Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token" },
                    // Access-Control-Allow-Methods = 'OPTIONS,' and whatever the resource method is
                    { "name":"Access-Control-Allow-Methods", "value":([resourceChain.method.httpMethod, "OPTIONS"]).join(",") },
                    // Access-Control-Allow-Origin = the configured CORS origin
                    { "name":"Access-Control-Allow-Origin", "value":task.cors.origin }
                ];

                return gatewayIntegration.Method_AddIntegrationResponse(optionsMethod, resourceChain.resource, apiId, headers)
                    .then((integrationResponse) => {
                        return optionsMethod;
                    });
            })
            ;
    }
}

function pushToStage(task, api) {
    if (!task.stage)
        return null;
    else
        return gatewayIntegration.Deployment_Create(task.stage, api.apiId);
}

module.exports.Task = apiGatewayTask;
