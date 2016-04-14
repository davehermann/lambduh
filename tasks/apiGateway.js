"use strict";

let aws = require("aws-sdk"),
    apiGateway = new aws.APIGateway({ apiVersion: "2015-07-09" }),
    lambdaTask = require("./lambda");

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
            return createMappings(task, api.apiId, api.existingResources, existingFunctions, configuration);
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
// { "path": "/site/defs", "method":"GET", "functionName":"definitionByHostname" }
        let pEndpoint = getResource(endpoint, apiId, existingResources)
            .then((resource) => {
                return addMethod(endpoint, resource, apiId);
            })
            .then((method) => {
                return lambdaIntegration(endpoint, method.resource, method.method, apiId, existingFunctions, configuration);
            })
            .then((integration) => {
                return integrationResponse(endpoint, integration.integration, integration.resource, integration.method, apiId, configuration);
            })
            .then((response) => {
                return methodResponse(endpoint, response.integrationResponse, response.integration, response.resource, response.method, apiId, configuration);
            });
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
            return new Promise((resolve, reject) => {
                let newMethod = new (function() {
                    this.httpMethod = endpoint.method.toUpperCase();
                    this.resourceId = resource.id;
                    this.restApiId = apiId;
                    this.authorizationType = "NONE";

                    if (!!endpoint.headers || (!!endpoint.parameters && (endpoint.method.toUpperCase() == "GET")))
                        this.requestParameters = new (function() {
                            if (!!endpoint.parameters)
                                endpoint.parameters.forEach((parameter) => {
                                    // Add the parameter with caching disabled
                                    this[`method.request.querystring.${parameter.name}`] = false;
                                });

                            if (!!endpoint.headers)
                                endpoint.headers.forEach((header) => {
                                    // Add the parameter with caching disabled
                                    this[`method.request.header.${header.name}`] = false;
                                });
                        })();
                })();
                apiGateway.putMethod(newMethod, (err, data) => {
                    if (!!err) {
console.log(err);
                        reject(err);
                    } else {
console.log("Created Method: ", data);
                        resolve({ resource: resource, method: data });
                    }
                });
            });
        });
}

function removeMethod(endpoint, resource, apiId) {
    return new Promise((resolve, reject) => {
        // If the method exists, delete it before re-adding
        if (!!resource.resourceMethods && resource.resourceMethods[endpoint.method.toUpperCase()]) {
            // If debugging, find the method first, and display details
            /*
            let findMethod = new (function() {
                this.httpMethod = endpoint.method.toUpperCase();
                this.resourceId = resource.id;
                this.restApiId = apiId;
            })();
            apiGateway.getMethod(findMethod, (err, data) => {
                if (!!err)
                    reject(err);
                else {
            console.log("Found Method: ", data);
            if (!!data.methodResponses)
            for (let code in data.methodResponses)
            console.log("Method Response: ", code, data.methodResponses[code]);

            if (!!data.methodIntegration && !!data.methodIntegration.integrationResponses)
            for (let code in data.methodIntegration.integrationResponses)
            console.log("Integration Response: ", code, data.methodIntegration.integrationResponses[code]);

                    resolve({ resource: resource, method: data });
                }
            });
            */
            let removeMethod = new (function() {
                this.restApiId = apiId;
                this.resourceId = resource.id;
                this.httpMethod = endpoint.method.toUpperCase();
            })();
console.log("Deleting Method: ", removeMethod);
            apiGateway.deleteMethod(removeMethod, (err, data) => {
                if (!!err) {
console.log(err);
                    reject(err);
                } else {
console.log("Deleted: ", data);
                    resolve(data);
                }
            });
        } else
            resolve();
    });
}

function lambdaIntegration(endpoint, resource, method, apiId, lambdaFunctions, configuration) {
    return new Promise((resolve, reject) => {
        let newIntegration = new (function() {
            this.httpMethod = method.httpMethod;
            this.resourceId = resource.id;
            this.restApiId = apiId;
            this.type = "AWS";
            this.integrationHttpMethod = "POST";

            if (!!endpoint.parameters && (endpoint.method.toUpperCase() == "GET")) {
                this.requestTemplates = new (function() {
                    // Create a JSON string with each parameter
                    let mappingTemplateItems = [];
                    endpoint.parameters.forEach((parameter) => {
                        mappingTemplateItems.push(inputMapping(parameter));
                    });

                    endpoint.headers.forEach((header) => {
                        mappingTemplateItems.push(inputMapping(header));
                    });

                    this["application/json"] = `{${mappingTemplateItems.join(",")}}`
                })();
            }
        })();

        // Find the function ARN
        let functionArn = null;
        for (let idx = 0; idx < lambdaFunctions.Functions.length; idx++) {
            if (lambdaFunctions.Functions[idx].FunctionName.toLowerCase() == (`${configuration.applicationName}_${endpoint.functionName}`).toLowerCase()) {
                functionArn = lambdaFunctions.Functions[idx].FunctionArn;
                newIntegration.uri = `arn:aws:apigateway:${configuration.awsRegion}:lambda:path/2015-03-31/functions/${functionArn}/invocations`;
                break;
            }
        }
        if (!newIntegration.uri)
            reject(`No lambda function named ${configuration.applicationName}_${endpoint.functionName} found`);
        else {

console.log("Add integration: ", newIntegration);
            apiGateway.putIntegration(newIntegration, (err, data) => {
                if (!!err) {
console.log(err);
                    reject(err);
                } else {
console.log("Integration Added: ", data);
                    resolve({ integration:data, method:method, resource: resource, functionArn: functionArn });
                }
            });
        }
    })
    .then((integration) => {
        let sourceArn = `arn:aws:execute-api:${configuration.awsRegion}:${configuration.awsAccountId}:${apiId}/*/${method.httpMethod}${endpoint.path}`;
        return lambdaTask.AddEventPermission(integration.functionArn, sourceArn, "apigateway.amazonaws.com")
            .then(() => {
                return integration;
            });
    });
}

function inputMapping(parameter) {
    let paramString = `\"${parameter.name}\":`;
    if (!parameter.notString)
        paramString += "\"";
    paramString += `$input.params(\'${parameter.name}\')`;
    if (!parameter.notString)
        paramString += "\"";

    return paramString;
}

function integrationResponse(endpoint, integration, resource, method, apiId, configuration) {
    return new Promise((resolve, reject) => {
        let newResponse = new (function() {
            this.restApiId = apiId;
            this.resourceId = resource.id;
            this.httpMethod = method.httpMethod;
            this.statusCode = "200";
            this.responseTemplates = new (function() {
                this["application/json"] = null;
            })();
        })();

console.log("Add Integration Response: ", newResponse);
        apiGateway.putIntegrationResponse(newResponse, (err, data) => {
            if (!!err) {
console.log(err);
                reject(err);
            } else {
console.log("Integration Response Created: ", data);
                resolve({ integrationResponse: data, integration: integration, resource: resource, method: method });
            }
        });
    });
}

function methodResponse(endpoint, integrationResponse, integration, resource, method, apiId, configuration) {
    return deleteMethodResponses(endpoint, resource, method, apiId)
        .then(() => {
            return new Promise((resolve, reject) => {
                let newResponse = new (function() {
                    this.restApiId = apiId;
                    this.resourceId = resource.id;
                    this.httpMethod = method.httpMethod;
                    this.statusCode = "200";
                    this.responseModels = new (function() {
                        this["application/json"] = "Empty";
                    })();
                })();
        console.log("Add Method Response: ", newResponse);
                apiGateway.putMethodResponse(newResponse, (err, data) => {
                    if (!!err) {
        console.log(err);
                        reject(err);
                    } else {
        console.log("Method Response Created: ", data);
                        resolve();
                    }
                });
            });
        })
        ;
}

function deleteMethodResponses(endpoint, resource, method, apiId) {
    // Find a 200
    let responseRemovals = [];

    if (!!method.methodResponses && !!method.methodResponses["200"]) {
        responseRemovals.push(new Promise((resolve, reject) => {
            let removeResponse = new (function() {
                this.restApiId = apiId;
                this.resourceId = resource.id;
                this.httpMethod = method.httpMethod;
                this.statusCode = "200";
            })();
console.log("Delete Method Response: ", removeResponse);

            apiGateway.deleteMethodResponse(removeResponse, (err, data) => {
                if (!!err) {
console.log(err);
                    reject(err);
                } else {
console.log("Method Response Deleted: ", data);
                    resolve();
                }
            });
        }));
    }

    return Promise.all(responseRemovals);
}

module.exports.Task = apiGatewayTask;
