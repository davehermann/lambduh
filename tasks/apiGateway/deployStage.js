"use strict";

const aws = require(`aws-sdk`),
    { GetResourcesForApi } = require(`./apiResources/getResources`),
    { GenerateIntegrationResponse } = require(`./lambdaIntegration/integrationResponse`),
    { GetExistingIntegration, SetLambdaIntegrationFunction } = require(`./lambdaIntegration/methodIntegration`),
    { CreateOrUpdateAlias, GetAliases } = require(`./lambdaIntegration/versioningAndAliases`),
    { Throttle } = require(`./throttle`),
    { Dev, Trace, Debug, Info, Warn } = require(`../../logging`);

const apiGateway = new aws.APIGateway({ apiVersion: `2015-07-09` });

function deployStage(task, remainingTasks) {
    if (!task.stagesToDeploy)
        return loadResourcesForApi(task);
    else
        return integrateNextResource(task, remainingTasks);
}

function loadResourcesForApi(task) {
    return GetResourcesForApi(task.apiId)
        .then(apiResources => {
            task.stagesToDeploy = task.versionAliases.map(alias => { return { stageName: alias, resources: apiResources.filter(() => { return true; }) }; });
        });
}

function integrateNextResource(task, remainingTasks, fromResourceIntegration) {
    let currentStage = task.stagesToDeploy[0];

    if (currentStage.resources.length > 0) {
        Info(`${currentStage.resources.length} remaining resources to check for ${currentStage.stageName} integration`);

        let thisResource = currentStage.resources.shift();
        Trace({ thisResource }, true);

        // For each method on the resource, check for an integration
        let methodList = [];
        if (!!thisResource.resourceMethods)
            for (let methodName in thisResource.resourceMethods)
                methodList.push(methodName);

        if (methodList.length > 0)
            return getMethods(methodList, currentStage.stageName, thisResource, task, remainingTasks);
        else
            return integrateNextResource(task, remainingTasks, true);
    } else if (fromResourceIntegration)
        // If the last resource in the list does not have a method, ensure pushing to stage happens on the next iteration
        return Promise.resolve();
    else
        return pushDeployment(task);
}

function pushDeployment(task) {
    let currentStage = task.stagesToDeploy.shift();

    let newDeployment = {
        restApiId: task.apiId,
        stageName: currentStage.stageName
    };

    Debug({ "Deploying API": newDeployment }, true);
    return apiGateway.createDeployment(newDeployment).promise()
        .then(() => {
            Warn(`API deployed to stage: ${newDeployment.stageName}`);
        });
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
    let neededAlias = methodAliases.filter(alias => { return alias.Name === stageName; }),
        pIntegrate = Promise.resolve();

    // When deploying a versioned stage, and the stage name exists, create a new alias to the version that the stage alias points to
    if ((neededAlias.length == 0) && (stageName !== task.deployment.stage)) {
        let stageAlias = methodAliases.filter(alias => { return alias.Name === task.deployment.stage; });

        // With a stage alias, a new versioned stage alias can be created
        if (stageAlias.length > 0)
            pIntegrate = CreateOrUpdateAlias(stageName, { existingAliases: methodAliases, newVersion: { FunctionName: noVersionArn, Version: stageAlias[0] } })
                .then(versioning => {
                    // versioning.newAliases[0] will be the neededAlias
                    neededAlias = versioning.newAliases;
                });
    }

    pIntegrate = pIntegrate
        .then(() => {
            // If no matching alias exists, throw an error as the release intent is unknown
            if (neededAlias.length == 0)
                return Promise.reject(`No alias ${stageName} exists for ${noVersionArn}.`);
        })
        .then(() => {
            Trace({ neededAlias, httpMethod: methodDetails.httpMethod, resource, stageName, noVersionArn }, true);
            Debug(`Updating integration for ${noVersionArn} with ${stageName} alias`);

            // Get the existing integration
            return GetExistingIntegration(methodDetails.httpMethod, resource.id, task.apiId);
        })
        // Set the alias as the integration for the method
        .then(existingIntegration => SetLambdaIntegrationFunction({ method: methodDetails.httpMethod }, { resource }, { newAliases: neededAlias }, existingIntegration, task, remainingTasks))
        // At this point, the integration response will have been wiped out, so regenerate
        .then(() => GenerateIntegrationResponse(task, { method: methodDetails, resource }));

    return pIntegrate;
}

module.exports.DeployStage = deployStage;
