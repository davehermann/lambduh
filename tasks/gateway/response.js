let aws = require("aws-sdk"),
    apiGateway = new aws.APIGateway({ apiVersion: "2015-07-09" });

function generateIntegrationResponse(taskConfiguration, httpMethod, resource, apiId) {
    let headers = null;

    // Add Access-Control-Allow-Origin header to the resource method
    if (!!taskConfiguration.cors && !!taskConfiguration.cors.origin)
        headers = [
            // Access-Control-Allow-Origin = the configured CORS origin
            { "name":"Access-Control-Allow-Origin", "value":taskConfiguration.cors.origin }
        ];

    return addIntegrationResponse(httpMethod, resource, apiId, headers);
}

function addIntegrationResponse(httpMethod, resource, apiId, headers) {
    return new Promise((resolve, reject) => {
        let newResponse = new (function() {
            this.restApiId = apiId;
            this.resourceId = resource.id;
            this.httpMethod = httpMethod;
            this.statusCode = "200";
            this.responseTemplates = new (function() {
                this["application/json"] = null;
            })();

            if (!!headers)
                this.responseParameters = new (function() {
                    headers.forEach((header) => {
                        this[`method.response.header.${header.name}`] = `'${header.value}'`;
                    });
                })();
        })();

        global.log.Debug(`Adding Integration Response`);
        global.log.Trace(newResponse);
        apiGateway.putIntegrationResponse(newResponse, (err, data) => {
            if (!!err) {
                global.log.Error(`Integration Response Error`, err);
                reject(err);
            } else {
                global.log.Debug(`Integration Response Created`);
                global.log.Trace(data);
                resolve(data);
            }
        });
    });
}

function generateMethodResponse(taskConfiguration, httpMethod, resource, apiId) {
    let headers = null;

    // Add Access-Control-Allow-Origin header to the resource method
    if (!!taskConfiguration.cors && !!taskConfiguration.cors.origin)
        headers = [
            // Access-Control-Allow-Origin = the configured CORS origin
            { "name":"Access-Control-Allow-Origin" }
        ]

    return addMethodResponse(resource, httpMethod, apiId, headers)
}

function addMethodResponse(resource, httpMethod, apiId, headers) {
    let newResponse = new (function() {
        this.restApiId = apiId;
        this.resourceId = resource.id;
        this.httpMethod = httpMethod;
        this.statusCode = "200";
        this.responseModels = new (function() {
            this["application/json"] = "Empty";
        })();

        if (!!headers)
            this.responseParameters = new (function() {
                headers.forEach((header) => {
                    this[`method.response.header.${header.name}`] = false;
                });
            })();
    })();

    global.log.Debug(`Adding Method Response`);
    global.log.Trace(newResponse);

    return apiGateway.putMethodResponse(newResponse).promise()
        .then((data) => {
            global.log.Debug(`Method Response Created`);
            global.log.Trace(data);
        })
        .catch((err) => {
            global.log.Error(`Method Response Add Error`, err);
            throw err;
        })
        ;
}

function deleteMethodResponses(resource, method, apiId, responseCodes) {
    // Find any response codes that need to be removed
    if (!responseCodes)
        responseCodes = ["200"];

    if (responseCodes.length > 0) {
        let removeResponseCode = responseCodes.shift();

        let pRemoval = Promise.resolve();

        if (!!method.methodResponses && !!method.methodResponses[removeResponseCode]) {
            let removeResponse = new (function() {
                this.restApiId = apiId;
                this.resourceId = resource.id;
                this.httpMethod = method.httpMethod;
                this.statusCode = removeResponseCode;
            })();
            global.log.Debug(`Delete Method Response`);
            global.log.Trace(removeResponse);

            pRemoval = apiGateway.deleteMethodResponse(removeResponse).promise()
                .then((data) => {
                    global.log.Debug(`Method Response Deleted`);
                    global.log.Trace(data);
                })
                .catch((err) => {
                    global.log.Error(`Method Response Delete Error`, err);
                    throw err;
                })
                ;
        }

        return pRemoval
            .then(() => {
                return deleteMethodResponses(resource, method, apiId, responseCodes);
            })
            ;
    } else
        return Promise.resolve();
}

module.exports.GenerateIntegrationReponse = generateIntegrationResponse;
module.exports.AddIntegrationResponse = addIntegrationResponse;
module.exports.GenerateMethodResponse = generateMethodResponse;
module.exports.AddMethodResponse = addMethodResponse;
module.exports.DeleteMethodResponses = deleteMethodResponses;
