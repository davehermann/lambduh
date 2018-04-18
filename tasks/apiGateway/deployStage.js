"use strict";

const aws = require(`aws-sdk`),
    { GetResourcesForApi } = require(`./apiResources/getResources`),
    { GenerateIntegrationResponse } = require(`./lambdaIntegration/integrationResponse`),
    { GetExistingIntegration, SetLambdaIntegrationFunction } = require(`./lambdaIntegration/methodIntegration`),
    { GetAliases } = require(`./lambdaIntegration/versioningAndAliases`),
    { Throttle } = require(`./throttle`),
    { Dev, Trace, Debug, Info } = require(`../../logging`);

const apiGateway = new aws.APIGateway({ apiVersion: `2015-07-09` });

function deployStage(stageName, task, remainingTasks) {
    let newDeployment = {
        restApiId: task.apiId,
        stageName
    };

    Info(`Generating resources for deployment to ${stageName} API`);

    return GetResourcesForApi(task.apiId)
        .then(apiResources => getResourceIntegration(apiResources, stageName, task, remainingTasks))
        .then(() => {
            Info({ "Deploying API": newDeployment }, true);
            return apiGateway.createDeployment(newDeployment).promise();
        });
}

function getResourceIntegration(resourceList, stageName, task, remainingTasks) {
    if (resourceList.length > 0) {
        Info(`${resourceList.length} remaining resources to check for ${stageName} integration`);

        let thisResource = resourceList.shift();
        Dev({ thisResource }, true);

        // For each method on the resource, check for an integration
        let methodList = [];
        if (!!thisResource.resourceMethods)
            for (let methodName in thisResource.resourceMethods)
                methodList.push(methodName);

        return getMethods(methodList, stageName, thisResource, task, remainingTasks)
            .then(() => getResourceIntegration(resourceList, stageName, task, remainingTasks));
    } else
        return Promise.resolve();
}

function getMethods(methodList, stageName, resource, task, remainingTasks) {
    if (methodList.length > 0) {
        let method = methodList.shift();

        Dev(`Checking ${method}`);
        return apiGateway.getMethod({ httpMethod: method, resourceId: resource.id, restApiId: task.apiId }).promise()
            .then(methodDetails => Throttle(methodDetails))
            .then(methodDetails => {
                if (!!methodDetails.methodIntegration && (methodDetails.methodIntegration.type.toLowerCase() !== `mock`)) {
                    Dev({ methodDetails }, true);

                    // Extract the function arn
                    let arn = methodDetails.methodIntegration.uri.match(/arn:aws:lambda:.*:\d+:function:.*:.*\/invocations/gi)[0].replace(/\/invocations/, ``);
                    Dev({ "Function ARN": arn }, true);

                    // The arn needs to end with the matching stage name
                    if (arn.search(new RegExp(`\\:${stageName}$`)) < 0) {
                        // Pull all aliases for the function
                        let noVersionArn = arn.split(`:`).slice(0, 7).join(`:`);
                        return GetAliases({ functionArn: noVersionArn })
                            .then(aliasData => setMethodIntegrationForDeployment(aliasData.existingAliases, methodDetails, resource, stageName, noVersionArn, task, remainingTasks));
                    } else
                        return null;
                } else {
                    Dev({ "no integration": methodDetails }, true);
                    return null;
                }
            })
            .then(() => getMethods(methodList, stageName, resource, task, remainingTasks));
    } else
        return Promise.resolve();
}

function setMethodIntegrationForDeployment(methodAliases, methodDetails, resource, stageName, noVersionArn, task, remainingTasks) {
    // Find one tagged with the stage name
    let neededAlias = methodAliases.filter(alias => { return alias.Name === stageName; });

    // If none exists, throw an error as the release intent is unknown
    if (neededAlias.length == 0)
        return Promise.reject(`No alias ${stageName} exists for ${noVersionArn}.`);
    else {
        Trace({ neededAlias, httpMethod: methodDetails.httpMethod, resource, stageName, noVersionArn }, true);
        Debug(`Updating integration for ${noVersionArn} with ${stageName} alias`);
        // Get the existing integration
        return GetExistingIntegration(methodDetails.httpMethod, resource.id, task.apiId)
            .then(existingIntegration => {
                // Set the alias as the integration for the method

                // Get the function name from the versionless ARN
                let arnParts = noVersionArn.split(`:`);
                return SetLambdaIntegrationFunction({ method: methodDetails.httpMethod }, { resource }, { newAliases: neededAlias }, existingIntegration, task, remainingTasks)
                    // The integration response will have been wiped out, so regenerate
                    .then(() => GenerateIntegrationResponse(task, { method: methodDetails, resource }));
            });
    }
}

module.exports.DeployStage = deployStage;
