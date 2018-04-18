"use strict";

const aws = require(`aws-sdk`),
    { Throttle } = require(`../throttle`),
    { Debug } = require(`../../../logging`);

const apiGateway = new aws.APIGateway({ apiVersion: `2015-07-09` });

function generateMethodResponse(task, methodResourceIntegration, headers) {
    // Add Access-Control-Allow-Origin header to the resource method
    if (!headers && !!task.cors && !!task.cors.origin)
        headers = [
            // Access-Control-Allow-Origin = the configured CORS origin
            { "name": `Access-Control-Allow-Origin` }
        ];

    return deleteMethodResponses(methodResourceIntegration, task.apiId)
        .then(() => addMethodResponse(methodResourceIntegration, task.apiId, headers))
        .then(methodResponseData => {
            methodResourceIntegration.methodResponse = methodResponseData;

            return methodResourceIntegration;
        });
}

function deleteMethodResponses(methodResourceIntegration, restApiId, responseCodes) {
    // Find any response codes that need to be removed
    if (!responseCodes)
        responseCodes = [`200`];

    if (responseCodes.length > 0) {
        let removeResponseCode = responseCodes.shift();

        let pRemoval = Promise.resolve();

        if (!!methodResourceIntegration.method.methodResponses && !!methodResourceIntegration.method.methodResponses[removeResponseCode]) {
            let removeResponse = {
                restApiId,
                resourceId: methodResourceIntegration.resource.id,
                httpMethod: methodResourceIntegration.method.httpMethod,
                statusCode: removeResponseCode
            };

            Debug({ "Delete method response": removeResponse });

            pRemoval = apiGateway.deleteMethodResponse(removeResponse).promise()
                .then(() => { Debug(`Method response deleted`); });
        }

        pRemoval = pRemoval
            .then(() => deleteMethodResponses(methodResourceIntegration, restApiId, responseCodes));

        return pRemoval;
    } else
        return Promise.resolve();
}

function addMethodResponse(methodResourceIntegration, restApiId, headers) {
    let newResponse = {
        restApiId,
        resourceId: methodResourceIntegration.resource.id,
        httpMethod: methodResourceIntegration.method.httpMethod,
        statusCode: `200`,
        responseModels: { [`application/json`]: `Empty` }
    };

    if (!!headers) {
        newResponse.responseParameters = {};
        headers.forEach(header => {
            newResponse.responseParameters[`method.response.header.${header.name}`] = false;
        });
    }

    Debug({ "Adding method response": newResponse });
    return apiGateway.putMethodResponse(newResponse).promise()
        .then(gatewayData => {
            Debug(`Method response created`);
            return gatewayData;
        })
        .then(gatewayData => Throttle(gatewayData));
}

module.exports.GenerateMethodResponse = generateMethodResponse;
