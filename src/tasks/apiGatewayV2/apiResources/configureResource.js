"use strict";

const { GetRoutesForApi, GetRouteForKey } = require(`./getRoutes`),
    { AddLambdaIntegration } = require(`../lambdaIntegration/methodIntegration`),
    { Debug } = require(`../../../logging`);

function configureResource(routeDefinition, task, remainingTasks) {
    Debug(`Exposing "${routeDefinition.functionName}" via route key "${routeDefinition.key}"`);

    return GetRoutesForApi(task.apiId)
        .then(foundRoutes => GetRouteForKey(routeDefinition.key, task.apiId, foundRoutes))
        .then(routeConfiguration => AddLambdaIntegration(routeDefinition, routeConfiguration, task, remainingTasks));
    // Unlike the Rest APIs, there are no more necessary steps to handle Websockets
}


module.exports.ConfigureResource = configureResource;
