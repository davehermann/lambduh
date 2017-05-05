let aws = require("aws-sdk"),
    apiGateway = new aws.APIGateway({ apiVersion: "2015-07-09" }),
    lambdaTask = require("../lambda");

function createDeployment(stageName, api) {
    let apiId = api.apiId;

    let newDeployment = new (function() {
        this.restApiId = apiId;
        this.stageName = stageName;
    })();

    global.log.Info(`Creating Deployment`);
    global.log.Trace(newDeployment);


    return new Promise((resolve, reject) => {
        apiGateway.createDeployment(newDeployment, (err, data) => {
            if (!!err) {
                global.log.Error(`Deployment Creation Error`, err);
                reject(err);
            } else {
                global.log.Warn(`API Gateway Deployed`);
                global.log.Trace(data);
                resolve(data);
            }
        });
    });
}


module.exports = createDeployment;
