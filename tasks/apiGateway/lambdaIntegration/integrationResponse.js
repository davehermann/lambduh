"use strict";

const aws = require(`aws-sdk`),
    { Throttle } = require(`../throttle`),
    { Dev, Trace, Debug, Info } = require(`../../../logging`);

const apiGateway = new aws.APIGateway({ apiVersion: `2015-07-09` });

function generateIntegrationResponse(task, methodResourceIntegration, headers) {
    // Add Access-Control-Allow-Origin header to the resource method
    if (!headers && !!task.cors && !!task.cors.origin)
        headers = [
            // Access-Control-Allow-Origin = the configured CORS origin
            { "name": `Access-Control-Allow-Origin`, "value": task.cors.origin }
        ];

    return addIntegrationResponse(methodResourceIntegration.method.httpMethod, methodResourceIntegration.resource.id, task.apiId, headers)
        .then(integrationData => {
            methodResourceIntegration.integrationResponse = integrationData;

            return methodResourceIntegration;
        });
}

function addIntegrationResponse(httpMethod, resourceId, restApiId, headers) {
    let newResponse = {
        restApiId,
        resourceId,
        httpMethod,
        statusCode: `200`,
        responseTemplates: { [`application/json`]: null }
    };

    if (!!headers) {
        newResponse.responseParameters = {};

        headers.forEach(header => {
            newResponse.responseParameters[`method.response.header.${header.name}`] = `'${header.value}'`;
        });
    }

    Debug({ "Adding integration response": newResponse }, true);

    return apiGateway.putIntegrationResponse(newResponse).promise()
        .then(gatewayData => {
            Debug(`Integration response created`);
            Trace({ "created response": gatewayData });

            return gatewayData;
        })
        .then(gatewayData => Throttle(gatewayData));
}

module.exports.GenerateIntegrationResponse = generateIntegrationResponse;
