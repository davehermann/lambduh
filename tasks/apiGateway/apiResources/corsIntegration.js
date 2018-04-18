"use strict";

const { AddMethod } = require(`./method`),
    { GenerateMethodResponse } = require(`./methodResponse`),
    { GenerateIntegrationResponse } = require(`../lambdaIntegration/integrationResponse`),
    { AddMockIntegration } = require(`../lambdaIntegration/methodIntegration`),
    { Debug } = require(`../../../logging`);

function addCorsMethod(endpointDefinition, task, methodResourceIntegration) {
    Debug(`Adding CORS OPTIONS method`);

    if (!task.cors) {
        Debug(`No CORS definition on task`);
        return Promise.resolve();
    } else if (!task.cors.origin)
        return Promise.reject(`CORS configuration must define "origin". Use "*" for all origins`);
    else {
        // Create OPTIONS method
        return AddMethod({ method: `OPTIONS` }, methodResourceIntegration.resource, task.apiId)
            // Add integration of type "Mock" with application/json mapping of: {"statusCode": 200}
            .then(optionsMethodResource => AddMockIntegration(optionsMethodResource, task.apiId, 200))
            .then(optionsMethodResource => {
                // Add method response of 200 with empty response model

                // Add headers to integration response
                let headers = [
                    // Access-Control-Allow-Headers
                    { "name": `Access-Control-Allow-Headers` },
                    // Access-Control-Allow-Methods
                    { "name": `Access-Control-Allow-Methods` },
                    // Access-Control-Allow-Origin
                    { "name": `Access-Control-Allow-Origin` }
                ];

                return GenerateMethodResponse(task, optionsMethodResource, headers);
            })
            .then(optionsMethodResource => {
                // Add integration response of 200 with an empty application/json mapping template

                // Add headers to integration response
                // Configure to use AWS-necessary (Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token),
                //      and any defined in the endpoint
                let allowedHeaders = [ `Content-Type`, `X-Amz-Date`, `Authorization`, `X-Api-Key`, `X-Amz-Security-Token` ];
                if (!!task.cors && !!task.cors.allowed && !!task.cors.allowed.headers)
                    allowedHeaders = allowedHeaders.concat(task.cors.allowed.headers.filter(header => { return (allowedHeaders.indexOf(header) < 0); }));
                if (!!endpointDefinition.headers)
                    endpointDefinition.headers.forEach((header) => {
                        if (allowedHeaders.indexOf(header.name) < 0)
                            allowedHeaders.push(header.name);
                    });

                let headers = [
                    // Access-Control-Allow-Headers = allowedHeaders
                    { "name": `Access-Control-Allow-Headers`, "value": allowedHeaders.join(`,`) },
                    // Access-Control-Allow-Methods = 'OPTIONS,' and whatever the resource method is
                    { "name": `Access-Control-Allow-Methods`, "value":([methodResourceIntegration.method.httpMethod, optionsMethodResource.method.httpMethod]).join(`,`) },
                    // Access-Control-Allow-Origin = the configured CORS origin
                    { "name": `Access-Control-Allow-Origin`, "value": task.cors.origin }
                ];

                return GenerateIntegrationResponse(task, optionsMethodResource, headers);
            });
    }
}

module.exports.AddCORSSupport = addCorsMethod;
