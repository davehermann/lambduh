"use strict";

/**
 * Follow the structure of the RestAPI task in ../apiGateway/apiGateway.js
 */

const aws = require(`aws-sdk`),
    { VersionAndAliasFunction } = require(`../apiGateway/lambdaIntegration/versioningAndAliases`),
    { ConfigureResource } = require(`./apiResources/configureResource`),
    { Trace, Debug, Info } = require(`../../logging`);

const apiGatewayV2 = new aws.ApiGatewayV2({ apiVersion: `2018-11-29` });

function apiGatewayV2Task(task, remainingTasks) {
    // Require a stage to be configured
    if (!task.deployment || !task.deployment.stage)
        return Promise.reject(new Error(`All API Gateway V2 tasks MUST have a deployment "stage" configured`));

    if (!task.apiId)
        // Get the API ID for the application API
        return getApiIdForApplicationName(remainingTasks.applicationName, task)
            // Store the API ID in the task data, along with a unique version ID
            .then(apiId => {
                task.apiId = apiId;
                task.createdAliases = [];
                task.versionAliases = [task.deployment.stage];
                if (task.deployment.production)
                    task.versionAliases.push(`${task.deployment.stage}_${remainingTasks.startTime.toFormat(`yyyyLLddHHmmss`)}`);

                if (!remainingTasks.deployedApis)
                    remainingTasks.deployedApis = [];

                remainingTasks.deployedApis.push({ apiId: task.apiId, aliases: task.versionAliases });
            })
            .then(() => { return false; });
    else if ((!!task.aliasNonRoutes && (task.aliasNonRoutes.length > 0)) || (!!task.routes && (task.routes.length > 0)))
        return processNextService(task, remainingTasks)
            .then(() => { return false; });
    else
        return Promise.resolve()
            .then(() => { return true; });
}

function getApiIdForApplicationName(applicationName, task) {
    // Retrieve all APIs in API Gateway
    return apiGatewayV2.getApis().promise()
        .then(apiData => {
            Info(`${apiData.Items.length} APIs found`);
            Trace({ "API Gateway configured APIs": apiData }, true);

            return apiData.Items;
        })
        .then(existingApis => {
            // Check for a match to the API name
            let matchingApis = existingApis.filter(api => { return (api.Name.toLowerCase() === applicationName.toLowerCase()); } );

            // With one match, return it
            if (matchingApis.length == 1)
                return matchingApis[0];
            // With no matches, create a new API
            else if (matchingApis.length == 0)
                return apiGatewayV2.createApi({
                    Name: applicationName,
                    ProtocolType: `WEBSOCKET`,
                    ApiKeySelectionExpression: `$request.header.x-api-key`,
                    RouteSelectionExpression: task.routeSelectionExpression || `$request.body.message`,
                }).promise();
            // Error for everything else
            else
                return Promise.reject(new Error(`More than one API matches the name ${applicationName.toLowerCase()}`));
        })
        .then(api => {
            Debug({ "Use API": api }, true);
            return api.ApiId;
        });
}

function processNextService(task, remainingTasks) {
    let counter = 0;
    if (!!task.aliasNonRoutes)
        counter += task.aliasNonRoutes.length;
    if (!!task.routes)
        counter += task.routes.length;
    Info(`${counter} remaining services to process for deployment`);

    // Step through one endpoint, or non-endpoint function, once per instance
    if (!!task.aliasNonRoutes && (task.aliasNonRoutes.length > 0))
        return processNextNonRoute(task, remainingTasks);
    else if (!!task.routes && (task.routes.length > 0))
        return processNextRoute(task, remainingTasks);
    else
        return Promise.resolve();
}

function processNextNonRoute(task, remainingTasks) {
    let serviceDefinition = task.aliasNonRoutes.shift();

    return VersionAndAliasFunction(serviceDefinition, task, remainingTasks);
}

function processNextRoute(task, remainingTasks) {
    let serviceDefinition = task.routes.shift();

    return ConfigureResource(serviceDefinition, task, remainingTasks);
}

module.exports.APIGatewayV2Task = apiGatewayV2Task;
