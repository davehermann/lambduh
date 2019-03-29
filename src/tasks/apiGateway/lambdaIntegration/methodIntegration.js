"use strict";

const aws = require(`aws-sdk`),
    { AddInvocationPermissions } = require(`./invocationPermissions`),
    { VersionAndAliasFunction } = require(`./versioningAndAliases`),
    { Throttle } = require(`../throttle`),
    { Dev, Trace, Debug } = require(`../../../logging`);

const apiGateway = new aws.APIGateway({ apiVersion: `2015-07-09` });

function addLambdaIntegrationRequest(endpointDefinition, methodResource, task, remainingTasks) {
    return VersionAndAliasFunction(endpointDefinition, task, remainingTasks)
        .then(aliasVersioning => methodIntegrationWithLambda(endpointDefinition, methodResource, aliasVersioning, task, remainingTasks))
        .then(integrationRequest => { return { integrationRequest, method: methodResource.method, resource: methodResource.resource }; });
}

function addMockIntegrationRequest(methodResource, restApiId, responseCode) {
    let newIntegration = {
        httpMethod: methodResource.method.httpMethod,
        resourceId: methodResource.resource.id,
        restApiId,
        type: `MOCK`
    };

    if ((responseCode !== null) || (responseCode !== undefined))
        newIntegration.requestTemplates = {
            [`application/json`]: `{"statusCode": ${responseCode}}`
        };

    return addIntegrationRequest(newIntegration)
        .then(integrationRequest => { return { integrationRequest, method: methodResource.method, resource: methodResource.resource }; });
}

function methodIntegrationWithLambda(endpointDefinition, methodResource, versioning, task, remainingTasks) {
    Debug(`Integrate ${endpointDefinition.functionName}`);
    Trace({ endpointDefinition, methodResource, versioning }, true);

    let integrationParameters = {};

    let endpointParameters = getEndpointParameters(methodResource, endpointDefinition.parameters);

    if (!!endpointDefinition.headers || (!!endpointParameters && (endpointDefinition.method.toUpperCase() == `Get`)) || !!endpointDefinition.endpointConfiguration)
        integrationParameters.requestTemplates = generateRequestTemplate(endpointDefinition, endpointParameters);

    return setIntegrationRequestToLambdaFunctionWithPredefinedTemplate(endpointDefinition, methodResource, versioning, integrationParameters, task, remainingTasks);
}

function getEndpointParameters(methodResource, parameters) {
    // Map any path parameters to input parameters
    if (methodResource.resource.path.search(/\{.*\}/g) >= 0) {
        if (!parameters)
            parameters = [];

        let pathParts = methodResource.resource.path.split(`/`);
        pathParts.forEach(part => {
            if (part.substr(0, 1) == `{`) {
                let param = part.substr(1, part.length - 2);
                parameters.push({ name: param, parameterName: param });
            }
        });
    }

    return parameters;
}

function generateRequestTemplate(endpointDefinition, endpointParameters) {
    // Create a JSON string with each parameter/header
    let mappingTemplateItems = [];
    if (!!endpointParameters)
        endpointParameters.forEach(parameter => {
            mappingTemplateItems.push(inputMapping(parameter));
        });

    if (!!endpointDefinition.headers)
        endpointDefinition.headers.forEach(header => {
            mappingTemplateItems.push(inputMapping(header));
        });

    let requestor = `"requestor":{"ip":"$context.identity.sourceIp","userAgent":"$context.identity.userAgent"}`;

    if (!!endpointDefinition.endpointConfiguration)
        mappingTemplateItems.push(`"endpointConfiguration": ${JSON.stringify(endpointDefinition.endpointConfiguration)}`);

    let template = {};

    if (endpointDefinition.method.toUpperCase() == `POST`)
        template[`application/json`] =
            `\n#set($rawBody = $input.body)`
            + `\n#if($rawBody == {})`
            + `\n{${mappingTemplateItems.join(`,`)},${requestor}}`
            + `\n#else`
            + `\n#set($jsonBody = $input.json('$'))`
            + `\n#set($jsonLength = $jsonBody.length())`
            + `\n#set($jsonToUse = $jsonBody.substring(1))`
            + `\n{${mappingTemplateItems.join(`,`)},${requestor},$jsonToUse`
            + `\n#end`
            + `\n`;
    else
        template[`application/json`] = `{${mappingTemplateItems.join(`,`)},${requestor}}`;

    return template;
}

function inputMapping(parameter) {
    let paramString = `"${!!parameter.parameterName ? parameter.parameterName : parameter.name}":`;

    if (!parameter.notString)
        paramString += `"`;
    paramString += `$input.params('${parameter.name}')`;
    if (!parameter.notString)
        paramString += `"`;

    return paramString;
}

function setIntegrationRequestToLambdaFunctionWithPredefinedTemplate(endpointDefinition, methodResource, versioning, integrationParameters, task, remainingTasks) {
    Debug(`Add integration request to Lambda Function via a template`);
    Dev({ endpointDefinition, methodResource, versioning, integrationParameters }, true);

    let lambdaAliasArn = versioning.newAliases.filter(alias => { return alias.Name == task.versionAliases[0]; }).map(alias => { return alias.AliasArn; })[0],
        versionUri = generateVersionUri(remainingTasks.awsRegion, lambdaAliasArn);

    let newIntegration = {
        httpMethod: endpointDefinition.method.toUpperCase(),
        resourceId: methodResource.resource.id,
        restApiId: task.apiId,
        type: `AWS`,
        integrationHttpMethod: `POST`,
        requestTemplates: integrationParameters.requestTemplates,
        uri: versionUri
    };

    return addIntegrationRequest(newIntegration)
        .then(gatewayData => {
            // Update the permissions to allow API Gateway to call the Lambda Function
            let sourceArn = `arn:aws:execute-api:${remainingTasks.awsRegion}:${remainingTasks.awsAccountId}:${task.apiId}/*/${newIntegration.httpMethod}${methodResource.resource.path}`;
            return AddInvocationPermissions(lambdaAliasArn, sourceArn, `apigateway.amazonaws.com`)
                .then(() => { return gatewayData; });
        });
}

function generateVersionUri(awsRegion, functionArn) {
    return `arn:aws:apigateway:${awsRegion}:lambda:path/2015-03-31/functions/${functionArn}/invocations`;
}

function addIntegrationRequest(newIntegration) {
    Trace({ newIntegration }, true);

    return apiGateway.putIntegration(newIntegration).promise()
        .then(gatewayData => {
            Dev({ "Integration added": gatewayData }, true);
            return gatewayData;
        })
        .then(gatewayData => Throttle(gatewayData));
}

function getIntegrationRequest(httpMethod, resourceId, restApiId) {
    let request = {
        httpMethod,
        resourceId,
        restApiId
    };

    Debug({ "Get integration request": request }, true);
    return apiGateway.getIntegration(request).promise()
        .then(gatewayData => Throttle(gatewayData))
        .then(gatewayData => {
            Trace({ "Integration request": gatewayData }, true);
            return gatewayData;
        });
}

module.exports.AddLambdaIntegration = addLambdaIntegrationRequest;
module.exports.SetLambdaIntegrationFunction = setIntegrationRequestToLambdaFunctionWithPredefinedTemplate;
module.exports.AddMockIntegration = addMockIntegrationRequest;
module.exports.GetExistingIntegration = getIntegrationRequest;
