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

function addMethodResponse(resource, method, apiId, headers) {
    return deleteMethodResponses(resource, method, apiId)
        .then(() => {
            return new Promise((resolve, reject) => {
                let newResponse = new (function() {
                    this.restApiId = apiId;
                    this.resourceId = resource.id;
                    this.httpMethod = method.httpMethod;
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
                apiGateway.putMethodResponse(newResponse, (err, data) => {
                    if (!!err) {
                        global.log.Error(`Method Response Add Error`, err);
                        reject(err);
                    } else {
                        global.log.Debug(`Method Response Created`);
                        global.log.Trace(data);
                        resolve(data);
                    }
                });
            });
        });
}

function deleteMethodResponses(resource, method, apiId) {
    // Find a 200
    let responseRemovals = [];

    if (!!method.methodResponses && !!method.methodResponses["200"]) {
        responseRemovals.push(new Promise((resolve, reject) => {
            let removeResponse = new (function() {
                this.restApiId = apiId;
                this.resourceId = resource.id;
                this.httpMethod = method.httpMethod;
                this.statusCode = "200";
            })();
            global.log.Debug(`Delete Method Response`);
            global.log.Trace(removeResponse);

            apiGateway.deleteMethodResponse(removeResponse, (err, data) => {
                if (!!err) {
                    global.log.Error(`Method Response Delete Error`, err);
                    reject(err);
                } else {
                    global.log.Debug(`Method Response Deleted`);
                    global.log.Trace(data);
                    resolve();
                }
            });
        }));
    }

    return Promise.all(responseRemovals);
}

module.exports.GenerateIntegrationReponse = generateIntegrationResponse;
module.exports.AddIntegrationResponse = addIntegrationResponse;
module.exports.AddMethodResponse = addMethodResponse;
