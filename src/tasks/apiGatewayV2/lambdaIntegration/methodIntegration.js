"use strict";

const aws = require(`aws-sdk`),
    { VersionAndAliasFunction } = require(`../../apiGateway/lambdaIntegration/versioningAndAliases`),
    { GetVersionUri } = require(`../../apiGateway/lambdaIntegration/methodIntegration`),
    { AddInvocationPermissions } = require(`../../apiGateway/lambdaIntegration/invocationPermissions`),
    { Throttle } = require(`../../apiGateway/throttle`),
    { Trace, Debug } = require(`../../../logging`);

const apiGatewayV2 = new aws.ApiGatewayV2({ apiVersion: `2018-11-29` });

function addLambdaIntegrationRequest(routeDefinition, routeConfiguration, task, remainingTasks) {
    return VersionAndAliasFunction(routeDefinition, task, remainingTasks)
        .then(aliasVersioning => routeIntegrationWithLambda(routeDefinition, routeConfiguration, aliasVersioning, task, remainingTasks))
        .then(integrationRequest => {
            // If the route is already configured for the correct Lambda integration, it won't be on the integration request object
            if (!integrationRequest.routeConfiguration)
                integrationRequest.routeConfiguration = routeConfiguration;

            return integrationRequest;
        });
}

function routeIntegrationWithLambda(routeDefinition, routeConfiguration, versioning, task, remainingTasks) {
    Debug(`Integrate ${routeDefinition.functionName}`);
    Trace({ routeDefinition, routeConfiguration, versioning }, true);

    let lambdaAliasArn = versioning.newAliases.filter(alias => { return alias.Name == task.versionAliases[0]; }).map(alias => { return alias.AliasArn; })[0],
        versionUri = GetVersionUri(remainingTasks.awsRegion, lambdaAliasArn);

    // Get all existing integrations for the API to see if one exists already
    return getAllIntegrationsForApi(task.apiId)
        .then(apiIntegrations => {
            // Filter for a matching integration
            let existingIntegration = apiIntegrations.filter(integration => { return (integration.IntegrationUri.indexOf(`/${lambdaAliasArn}/`) > 0); });

            if (existingIntegration.length > 1)
                return Promise.reject(new Error(`${existingIntegration.length} integrations found for ${routeDefinition.functionName}`));

            return ((existingIntegration.length == 1) ? updateLambdaIntegration(existingIntegration[0], versionUri, task.apiId) : createNewLambdaIntegration(task.apiId, versionUri));
        })
        .then(apiLambdaIntegration => {
            // Update the permissions to allow API Gateway to call the Lambda Function
            let sourceArn = `arn:aws:execute-api:${remainingTasks.awsRegion}:${remainingTasks.awsAccountId}:${task.apiId}/*/${routeDefinition.key}`;
            return AddInvocationPermissions(lambdaAliasArn, sourceArn, `apigateway.amazonaws.com`)
                .then(() => { return apiLambdaIntegration; });
        })
        .then(apiLambdaIntegration => updateRouteWithLambdaIntegration(routeConfiguration, apiLambdaIntegration, task));
}

function updateRouteWithLambdaIntegration(routeConfiguration, apiLambdaIntegration, task) {
    // Set the route target
    let Target = `integrations/${apiLambdaIntegration.IntegrationId}`;

    // If the route is configured with the correct integration ID, do nothing
    if (!!routeConfiguration.Target && (routeConfiguration.Target == Target))
        return Promise.resolve({ apiLambdaIntegration });

    return apiGatewayV2.updateRoute({ ApiId: task.apiId, RouteId: routeConfiguration.RouteId, Target }).promise()
        .then(updatedRouteConfiguration  => {
            Trace({ updatedRouteConfiguration  }, true);

            return { apiLambdaIntegration, routeConfiguration: updatedRouteConfiguration };
        });
}

function updateLambdaIntegration(existingIntegration, IntegrationUri, ApiId) {
    Trace({ existingIntegration, IntegrationUri }, true);

    let updateLambdaIntegrationForApi = {
        ApiId,
        IntegrationId: existingIntegration.IntegrationId,
        IntegrationUri,
    };
    return apiGatewayV2.updateIntegration(updateLambdaIntegrationForApi).promise()
        .then(gatewayData => Throttle(gatewayData, 500))
        .then(gatewayData => {
            Debug({ updatedLambdaIntegration: gatewayData }, true);

            return gatewayData;
        });
}

function createNewLambdaIntegration(ApiId, IntegrationUri) {
    let newLambdaIntegrationForApi = {
        ApiId,
        ConnectionType: `INTERNET`,
        ContentHandlingStrategy: `CONVERT_TO_TEXT`,
        IntegrationMethod: `POST`,
        IntegrationType: `AWS_PROXY`,
        IntegrationUri,
        PassthroughBehavior: `WHEN_NO_MATCH`
    };

    Trace({ newLambdaIntegrationForApi }, true);

    return apiGatewayV2.createIntegration(newLambdaIntegrationForApi).promise()
        .then(gatewayData => Throttle(gatewayData, 500))
        .then(gatewayData => {
            Debug({ createdLambdaIntegration: gatewayData }, true);

            return gatewayData;
        });
}

function getAllIntegrationsForApi(ApiId, NextToken, lambdaIntegrations) {
    if (!lambdaIntegrations || !!NextToken)
        return apiGatewayV2.getIntegrations({ ApiId, NextToken }).promise()
            .then(foundIntegrations => Throttle(foundIntegrations, 500))
            .then(foundIntegrations => {
                if (!lambdaIntegrations)
                    lambdaIntegrations = [];

                lambdaIntegrations = lambdaIntegrations.concat(foundIntegrations.Items);

                return getAllIntegrationsForApi(ApiId, foundIntegrations.NextToken, lambdaIntegrations);
            });
    else {
        Trace({ ApiId, lambdaIntegrations }, true);
        return Promise.resolve(lambdaIntegrations);
    }
}

module.exports.AddLambdaIntegration = addLambdaIntegrationRequest;
