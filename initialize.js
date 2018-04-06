"use strict";

const { FunctionConfiguration } = require(`./tasks/lambda/lambda`),
    { Debug } = require(`./logging`);

function initialize(context) {
    let awsRegion = null,
        awsAccountId = null;

    // Get the configuration for this Lambda function
    return FunctionConfiguration(context.functionName)
        .then(thisFunctionConfiguration => {
            // Parse the current region, and account ID, from this function's ARN
            let arnParts = thisFunctionConfiguration.FunctionArn.split(`:`);
            awsRegion = arnParts[3];
            awsAccountId = arnParts[4];

            Debug(`Running in ${awsRegion} for account id ${awsAccountId}`);
        });
}

module.exports.Initialize = initialize;
