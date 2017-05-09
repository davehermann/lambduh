let aws = require("aws-sdk"),
    apiGateway = new aws.APIGateway({ apiVersion: "2015-07-09" }),
    lambdaTask = require("../lambda"),
    functionIntegration = require("./integration");

function createDeployment(stageName, api, configuration) {
    let apiId = api.apiId;

    let newDeployment = new (function() {
        this.restApiId = apiId;
        this.stageName = stageName;
    })();

    global.log.Info(`Creating Deployment`);
    global.log.Trace(newDeployment);

    // Pull the entire API
    // Step through the entire set of API resources
    return getResourceIntegration(api, stageName, configuration)
        .then(() => {
            return apiGateway.createDeployment(newDeployment).promise();
        })
        .then((data) => {
            global.log.Warn(`API Gateway Deployed`);
            global.log.Trace(data);
        })
        ;
}

function getResourceIntegration(api, stageName, configuration, resourceList) {
    if (!resourceList)
        resourceList = api.existingResources.items.filter(() => { return true; });

    if (resourceList.length > 0) {
        let thisResource = resourceList.shift();
        global.log.Trace(JSON.stringify(thisResource));

        // For each method on the resource, check for an integration
        let methodList = [];
        for (let methodName in thisResource.resourceMethods)
            methodList.push(methodName);

        return getMethods(methodList, thisResource, stageName, api.apiId, configuration)
            .then(() => {
                return getResourceIntegration(api, stageName, configuration, resourceList);
            })
            ;
    } else
        return Promise.resolve();
}

function getMethods(methodList, resource, stageName, apiId, configuration) {
    if (methodList.length > 0) {
        let methodName = methodList.shift();

        return apiGateway.getMethod({ httpMethod: methodName, resourceId: resource.id, restApiId: apiId }).promise()
            .then((methodDetails) => {
                // Ignore methods of integration type MOCK
                if (!!methodDetails.methodIntegration && (methodDetails.methodIntegration.type.toLowerCase() != `mock`)) {
                    global.log.Trace(methodDetails.httpMethod, methodDetails.methodIntegration.uri);
                    // Extract the function arn
                    let arn = methodDetails.methodIntegration.uri.match(/arn\:aws\:lambda\:.*\:\d+\:function\:.*\:.*\/invocations/gi)[0].replace(/\/invocations/, ``);
                    global.log.Trace(arn);

                    // The arn needs to end with the matching stage name
                    if (arn.search(new RegExp(`\\:${stageName}$`)) < 0) {
                        // Pull all aliases for the function
                        let noVersionArn = arn.split(`:`).slice(0, 7).join(`:`);
                        return lambdaTask.GetAliases(noVersionArn)
                            .then((foundAliases) => {
                                // Find one tagged with the stage name
                                let neededAlias = foundAliases.Aliases.filter((alias) => { return alias.Name === stageName; });

                                // If none exists, throw an error as the release intent is unknown
                                if (neededAlias.length == 0)
                                    throw `No alias ${stageName} exists for ${noVersionArn}.`;
                                else
                                    // Get the existing integration
                                    return functionIntegration.GetExistingIntegration(methodDetails.httpMethod, resource.id, apiId)
                                        .then((existingIntegration) => {
                                            // Only 2 1/2 requests allowed per second
                                            return throttle(400)
                                                .then(() => {
                                                    return existingIntegration;
                                                });
                                        })
                                        .then((existingIntegration) => {
                                            // Set the alias as the integration for the method

                                            // Get the function name from the versionless ARN
                                            let arnParts = noVersionArn.split(`:`);
                                            return functionIntegration.IntegrateToLambdaWithDefinedRequestTemplates(methodDetails.httpMethod, resource, apiId, configuration.awsRegion, configuration.awsAccountId, neededAlias[0].AliasArn, existingIntegration.requestTemplates, arnParts[arnParts.length - 1]);
                                        })
                                        ;
                            })
                            ;
                    } else
                        return Promise.resolve();
                } else
                    return Promise.resolve();
            })
            .then(() => {
                // Only 2 1/2 requests allowed per second
                return throttle(400);
            })
            .then(() => {
                return getMethods(methodList, resource, stageName, apiId, configuration);
            })
            ;
    } else
        return Promise.resolve();
}

function throttle(limit) {
    return new Promise(resolve => {
        setTimeout(resolve, limit);
    });
}

module.exports = createDeployment;