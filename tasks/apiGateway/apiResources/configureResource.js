"use strict";

const { AddMethod } = require(`./method`),
    { AddCORSSupport } = require(`./corsIntegration`),
    { GetResourcesForApi, GetResourceForPath } = require(`./getResources`),
    { GenerateIntegrationResponse } = require(`../lambdaIntegration/integrationResponse`),
    { AddLambdaIntegration } = require(`../lambdaIntegration/methodIntegration`),
    { GenerateMethodResponse } = require(`./methodResponse`),
    { Dev, Trace, Debug, Info } = require(`../../../logging`);


function configureResource(endpointDefinition, task, remainingTasks) {
    Debug(`Exposing ${endpointDefinition.functionName} on ${endpointDefinition.path}:${endpointDefinition.method}`);

    return GetResourcesForApi(task.apiId)
        .then(foundResources => GetResourceForPath(endpointDefinition.path, task.apiId, foundResources))
        .then(pathResource => AddMethod(endpointDefinition, pathResource, task.apiId))
        .then(methodResource => AddLambdaIntegration(endpointDefinition, methodResource, task, remainingTasks))
        .then(methodResourceIntegration => GenerateMethodResponse(task, methodResourceIntegration))
        .then(methodResourceIntegration => GenerateIntegrationResponse(task, methodResourceIntegration))
        .then(methodResourceIntegration => AddCORSSupport(endpointDefinition, task, methodResourceIntegration));
}


module.exports.ConfigureResource = configureResource;
