"use strict";

const aws = require(`aws-sdk`),
    { VersionAndAliasFunction } = require(`./lambdaIntegration/versioningAndAliases`),
    { ConfigureResource } = require(`./apiResources/configureResource`),
    { Trace, Debug, Info } = require(`../../logging`);

const apiGateway = new aws.APIGateway({ apiVersion: `2015-07-09` });

function apiGatewayTask(task, remainingTasks) {
    // Require a stage to be configured
    if (!task.stage)
        return Promise.reject(`All API Gateway tasks MUST have a deployment "stage" configured`);

    if (!task.apiId)
        // Get the API ID for the application API
        return getApiIdForApplicationName(remainingTasks.applicationName)
            // Store the API ID in the task data, along with a unique version ID
            .then(apiId => {
                task.apiId = apiId;
                task.versionId = `${task.stage}_${remainingTasks.startTime.toFormat(`yyyyLLddHHmmss`)}`;
            });
    else
        return processNextService(task, remainingTasks);
}

function getApiIdForApplicationName(applicationName) {
    // Retrieve all APIs in API Gateway
    return apiGateway.getRestApis().promise()
        .then(apiData => {
            Info(`${apiData.items.length} APIs found`);
            Trace({ "API Gateway configured APIs": apiData }, true);

            return apiData.items;
        })
        .then(existingApis => {
            // Check for a match to the API name
            let matchingApis = existingApis.filter(api => { return (api.name.toLowerCase() === applicationName.toLowerCase()); } );

            // With one match, return it
            if (matchingApis.length == 1)
                return matchingApis[0];
            // With no matches, create a new API
            else if (matchingApis.length == 0)
                return apiGateway.createRestApi({ name: applicationName });
            // Error for everything else
            else
                return Promise.reject(`More than one API matches the name ${applicationName.toLowerCase()}`);
        })
        .then(api => {
            Debug({ "Use API": api }, true);
            return api.id;
        });
}

function processNextService(task, remainingTasks) {
    // Step through one endpoint, or non-endpoint function, once per instance
    if (!!task.aliasNonEndpoints && (task.aliasNonEndpoints.length > 0))
        return processNextNonEndpoint(task, remainingTasks);
    else if (!!task.endpoints && (task.endpoints.length > 0))
        return processNextEndpoint(task, remainingTasks);
    else
        return Promise.resolve();
}

function processNextNonEndpoint(task, remainingTasks) {
    let serviceDefinition = task.aliasNonEndpoints.shift();

    return VersionAndAliasFunction(serviceDefinition, task, remainingTasks);
}

function processNextEndpoint(task, remainingTasks) {
    let serviceDefinition = task.endpoints.shift();

    return ConfigureResource(serviceDefinition, task, remainingTasks);
}

module.exports.APIGatewayTask = apiGatewayTask;
