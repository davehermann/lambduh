let aws = require("aws-sdk"),
    apiGateway = new aws.APIGateway({ apiVersion: "2015-07-09" }),
    lambdaTask = require("../lambda");

function addIntegrationRequest(integrationParameters) {
    return new Promise((resolve, reject) => {
        global.log.Debug(`Adding Method Integration`);
        global.log.Trace(integrationParameters);

        apiGateway.putIntegration(integrationParameters, (err, data) => {
            if (!!err) {
                global.log.Error(err);
                reject(err);
            } else {
                global.log.Debug(`Integration Added`);
                global.log.Trace(data);
                resolve(data);
            }
        });
    });
}

function getIntegrationRequest(httpMethod, resourceId, restApiId) {
    let request = new (function() {
        this.httpMethod = httpMethod;
        this.resourceId = resourceId;
        this.restApiId = restApiId;
    })();

    global.log.Debug(`Get Integration for ${JSON.stringify(request)}`);
    return apiGateway.getIntegration(request).promise()
        .then((data) => {
            global.log.Trace(JSON.stringify(data));
            return data;
        })
        ;
}

function generateVersionUri(awsRegion, functionArn) {
    return `arn:aws:apigateway:${awsRegion}:lambda:path/2015-03-31/functions/${functionArn}/invocations`;
}

function inputMapping(parameter) {
    let paramString = `\"${!!parameter.parameterName ? parameter.parameterName : parameter.name}\":`;
    if (!parameter.notString)
        paramString += "\"";
    paramString += `$input.params(\'${parameter.name}\')`;
    if (!parameter.notString)
        paramString += "\"";

    return paramString;
}

function setIntegrationRequestToLambdaFunction(httpMethod, resource, apiId, awsRegion, awsAccountId, aliasArn, headers, parameters, endpointConfiguration, functionName, applicationName) {
    let newIntegration = new (function() {
        // Map any path parameters to input parameters
        if (resource.path.search(/\{.*\}/g) >= 0) {
            if (!parameters)
                parameters = [];

            let pathParts = resource.path.split(`/`);
            pathParts.forEach((part) => {
                if (part.substr(0, 1) == `{`) {
                    let param = part.substr(1, part.length - 2);
                    parameters.push({ name: param, parameterName: param });
                }
            });
        }

        if (!!headers || (!!parameters && (httpMethod.toUpperCase() == "GET")) || !!endpointConfiguration)
            this.requestTemplates = new (function() {
                // Create a JSON string with each parameter
                let mappingTemplateItems = [];
                if (!!parameters)
                    parameters.forEach((parameter) => {
                        mappingTemplateItems.push(inputMapping(parameter));
                    });

                if (!!headers)
                    headers.forEach((header) => {
                        mappingTemplateItems.push(inputMapping(header));
                    });

                let requestor = `"requestor":{"ip":"$context.identity.sourceIp","userAgent":"$context.identity.userAgent"}`;

                if (!!endpointConfiguration)
                    mappingTemplateItems.push(`"endpointConfiguration": ${JSON.stringify(endpointConfiguration)}`);

                if (httpMethod.toUpperCase() == "POST")
                    this[`application/json`] = `
#set($rawBody = $input.body)
#if($rawBody == {})
{${mappingTemplateItems.join(",")},${requestor}}
#else
#set($jsonBody = $input.json('$'))
#set($jsonLength = $jsonBody.length())
#set($jsonToUse = $jsonBody.substring(1))
{${mappingTemplateItems.join(`,`)},${requestor},$jsonToUse
#end
`;
                else
                    this["application/json"] = `{${mappingTemplateItems.join(",")},${requestor}}`
            })();
    })();

    return setIntegrationRequestToLambdaFunctionWithPredefinedTemplate(httpMethod, resource, apiId, awsRegion, awsAccountId, aliasArn, newIntegration.requestTemplates, `ld_${applicationName}_${functionName}`);
}

function setIntegrationRequestToLambdaFunctionWithPredefinedTemplate(httpMethod, resource, apiId, awsRegion, awsAccountId, aliasArn, requestTemplates, lambdaFunctionName) {
    let functionUris = { functionArn: aliasArn, versionUri: generateVersionUri(awsRegion, aliasArn) };

    let newIntegration = new (function() {
        this.httpMethod = httpMethod;
        this.resourceId = resource.id;
        this.restApiId = apiId;
        this.type = "AWS";
        this.integrationHttpMethod = "POST";
        this.requestTemplates = requestTemplates;
        this.uri = functionUris.versionUri;
    })();

    if (!newIntegration.uri)
        throw `No lambda function named "${lambdaFunctionName}" found`;
    else
        return addIntegrationRequest(newIntegration)
            .then((integrationData) => {
                let sourceArn = `arn:aws:execute-api:${awsRegion}:${awsAccountId}:${apiId}/*/${httpMethod}${resource.path}`;
                return lambdaTask.AddEventPermission(functionUris.functionArn, sourceArn, "apigateway.amazonaws.com")
                    .then(() => {
                        return integrationData;
                    });
            });
}

function addMockIntegrationRequest(method, responseCode, resource, apiId) {
    let newIntegration = new (function() {
        this.httpMethod = method.httpMethod;
        this.resourceId = resource.id;
        this.restApiId = apiId;
        this.type = "MOCK";

        if ((responseCode !== null) || (responseCode !== undefined))
            this.requestTemplates = new (function() {
                this["application/json"] = `{"statusCode": ${responseCode}}`;
            })();
    })();

    return addIntegrationRequest(newIntegration);
}

module.exports.IntegrateToLambda = setIntegrationRequestToLambdaFunction;
module.exports.IntegrateToLambdaWithDefinedRequestTemplates = setIntegrationRequestToLambdaFunctionWithPredefinedTemplate;
module.exports.GetExistingIntegration = getIntegrationRequest;
module.exports.Method_MockIntegrationRequest = addMockIntegrationRequest;
