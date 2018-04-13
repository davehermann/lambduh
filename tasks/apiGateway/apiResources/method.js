"use strict";

const aws = require(`aws-sdk`),
    { Throttle } = require(`../throttle`),
    { Dev, Trace, Debug, Info } = require(`../../../logging`);

const apiGateway = new aws.APIGateway({ apiVersion: `2015-07-09` });

function addMethod(endpointDefinition, resource, restApiId) {
    Trace({ resource }, true);

    return deleteMethod(endpointDefinition.method, resource, restApiId)
        .then(() => addMethodToResource(endpointDefinition, resource, restApiId))
        .then(method => { return { resource, method }; });
}

function deleteMethod(httpMethod, resource, restApiId) {
    httpMethod = httpMethod.toUpperCase();

    // If the method exists, delete it
    if (!!resource.resourceMethods && !!resource.resourceMethods[httpMethod]) {
        let deleteParams = { restApiId, resourceId: resource.id, httpMethod };
        Debug({ "Deleting method": deleteParams }, true);
        return apiGateway.deleteMethod(deleteParams).promise()
            .then(() => { Trace(`Deleted`); })
            .then(() => Throttle());
    } else
        return Promise.resolve();
}

function addMethodToResource(endpointDefinition, resource, restApiId) {
    let newMethod = {
        httpMethod: endpointDefinition.method.toUpperCase(),
        resourceId: resource.id,
        restApiId,
        authorizationType: `NONE`
    };

    if (!!endpointDefinition.headers || (!!endpointDefinition.parameters && (newMethod.httpMethod == `GET`))) {
        newMethod.requestParameters = {};

        if (!!endpointDefinition.parameters)
            endpointDefinition.parameters.forEach(parameter => {
                // Add the parameter with caching disabled
                newMethod.requestParameters[`method.request.querystring.${parameter.name}`] = false;
            });

        if (!!endpointDefinition.headers)
            endpointDefinition.headers.forEach(header => {
                // Add the header with caching disabled
                newMethod.requestParameters[`method.request.header.${header.name}`] = false;
            });
    }

    Info(`Add method ${newMethod.httpMethod}`);
    Trace({ newMethod }, true);

    return apiGateway.putMethod(newMethod).promise()
        .then(gatewayData => {
            Debug({ "Method created": gatewayData }, true);
            return gatewayData;
        })
        .then(gatewayData => Throttle(gatewayData));
}

module.exports.AddMethod = addMethod;
