"use strict";

let aws = require("aws-sdk"),
    apiGateway = new aws.APIGateway({ apiVersion: "2015-07-09" }),
    lambdaTask = require("../lambda");

let apiDeployment = require("./apiDeployment"),
    functionIntegration = require("./integration");

function deleteMethodFromResource(httpMethod, resource, apiId) {
    return new Promise((resolve, reject) => {
        // If the method exists, delete it
        if (!!resource.resourceMethods && resource.resourceMethods[httpMethod.toUpperCase()]) {
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
                this.httpMethod = httpMethod.toUpperCase();
            })();
            global.log.Debug(`Deleting Method`, removeMethod);
            apiGateway.deleteMethod(removeMethod, (err, data) => {
                if (!!err) {
                    global.log.Error(`Method Delete Error`, err);
                    reject(err);
                } else {
                    global.log.Debug(`Deleted`)
                    global.log.Trace(data);
                    resolve(data);
                }
            });
        } else
            resolve();
    });
}

function addMethodToResource(httpMethod, resource, apiId, headers, parameters) {
    return new Promise((resolve, reject) => {
        let newMethod = new (function() {
            this.httpMethod = httpMethod.toUpperCase();
            this.resourceId = resource.id;
            this.restApiId = apiId;
            this.authorizationType = "NONE";

            if (!!headers || (!!parameters && (httpMethod.toUpperCase() == "GET")))
                this.requestParameters = new (function() {
                    if (!!parameters)
                        parameters.forEach((parameter) => {
                            // Add the parameter with caching disabled
                            this[`method.request.querystring.${parameter.name}`] = false;
                        });

                    if (!!headers)
                        headers.forEach((header) => {
                            // Add the parameter with caching disabled
                            this[`method.request.header.${header.name}`] = false;
                        });
                })();
        })();
        global.log.Info(`Add Method ${newMethod.httpMethod}`);
        global.log.Trace(newMethod);
        apiGateway.putMethod(newMethod, (err, data) => {
            if (!!err) {
                global.log.Error(`Add Method Error`, err);
                reject(err);
            } else {
                global.log.Debug(`Method Created`);
                global.log.Trace(data);
                resolve(data);
            }
        });
    });
}

function addLambdaIntegrationRequest(method, headers, parameters, endpointConfiguration, resource, apiId, applicationName, functionName, awsRegion, awsAccountId, knownLambdaFunctions, task) {
    return versionAndAliasLambdaFunction(applicationName, functionName, awsRegion, knownLambdaFunctions, task)
        .then((aliasArn) => {
            return functionIntegration.IntegrateToLambda(method.httpMethod, resource, apiId, awsRegion, awsAccountId, aliasArn, headers, parameters, endpointConfiguration, functionName, applicationName);
        });
}
function versionAndAliasLambdaFunction(applicationName, functionName, awsRegion, knownLambdaFunctions, task) {
    // Find the function ARN
    let functionDetail = null;
    for (let idx = 0; idx < knownLambdaFunctions.Functions.length; idx++) {
        if (knownLambdaFunctions.Functions[idx].FunctionName.toLowerCase() == (`ld_${applicationName}_${functionName}`).toLowerCase()) {
            functionDetail = knownLambdaFunctions.Functions[idx];
            break;
        }
    }

    // The functionArn and versionUri should point to the in-use function/alias
    if (!task.stage)
        return functionDetail.FunctionArn;
    else
        // Version the function
        return lambdaTask.CreateFunctionVersion(functionDetail.FunctionArn)
            .then((versionCreated) => {
                return { newVersion: versionCreated };
            })
            .then((versioning) => {
                // Get all function aliases
                return lambdaTask.GetAliases(functionDetail.FunctionArn)
                    .then((aliasesFound) => {
                        versioning.allAliases = aliasesFound.Aliases;
                        return versioning;
                    });
            })
            .then((versioning) => {
                let foundAlias = null;
                versioning.allAliases.forEach((alias) => {
                    if (alias.Name == task.stage)
                        foundAlias = alias;
                });

                // If an alias to the function with the stage name exists, repoint to the new version
                // Otherwise, create the alias
                return lambdaTask.ModifyAlias(versioning.newVersion, task.stage, !!foundAlias)
                    .then((updateData) => {
                        return updateData.AliasArn;
                    });
            })
            .then((aliasArn) => {
                return lambdaTask.DeleteEmptyVersions(functionDetail.FunctionArn)
                    .then(() => {
                        return aliasArn;
                    });
            })
            ;
}

function addIntegrationResponse(method, resource, apiId, headers) {
    return new Promise((resolve, reject) => {
        let newResponse = new (function() {
            this.restApiId = apiId;
            this.resourceId = resource.id;
            this.httpMethod = method.httpMethod;
            this.statusCode = "200";
            this.responseTemplates = new (function() {
                this["application/json"] = null;
            })();

            if (!!headers)
                this.responseParameters = new (function() {
                    headers.forEach((header) => {
                        this[`method.response.header.${header.name}`] = `'${header.value}'`;
                    });
                })();
        })();

        global.log.Debug(`Adding Integration Response`);
        global.log.Trace(newResponse);
        apiGateway.putIntegrationResponse(newResponse, (err, data) => {
            if (!!err) {
                global.log.Error(`Integration Response Error`, err);
                reject(err);
            } else {
                global.log.Debug(`Integration Response Created`);
                global.log.Trace(data);
                resolve(data);
            }
        });
    });
}

function deleteMethodResponses(resource, method, apiId) {
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
            global.log.Debug(`Delete Method Response`);
            global.log.Trace(removeResponse);

            apiGateway.deleteMethodResponse(removeResponse, (err, data) => {
                if (!!err) {
                    global.log.Error(`Method Response Delete Error`, err);
                    reject(err);
                } else {
                    global.log.Debug(`Method Response Deleted`);
                    global.log.Trace(data);
                    resolve();
                }
            });
        }));
    }

    return Promise.all(responseRemovals);
}

function addMethodResponse(resource, method, apiId, headers) {
    return deleteMethodResponses(resource, method, apiId)
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

                    if (!!headers)
                        this.responseParameters = new (function() {
                            headers.forEach((header) => {
                                this[`method.response.header.${header.name}`] = false;
                            });
                        })();
                })();
                global.log.Debug(`Adding Method Response`);
                global.log.Trace(newResponse);
                apiGateway.putMethodResponse(newResponse, (err, data) => {
                    if (!!err) {
                        global.log.Error(`Method Response Add Error`, err);
                        reject(err);
                    } else {
                        global.log.Debug(`Method Response Created`);
                        global.log.Trace(data);
                        resolve(data);
                    }
                });
            });
        });
}


module.exports.Method_DeleteFromResource = deleteMethodFromResource;
module.exports.Method_AddToResource = addMethodToResource;
module.exports.Method_LambdaIntegrationRequest = addLambdaIntegrationRequest;
module.exports.Method_AddIntegrationResponse = addIntegrationResponse;
module.exports.Method_AddMethodResponse = addMethodResponse;
module.exports.Method_CreateLambdaVersion = versionAndAliasLambdaFunction;

module.exports.Deployment_Create = apiDeployment;
