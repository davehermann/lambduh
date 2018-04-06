"use strict";

const aws = require(`aws-sdk`),
    { Trace } = require(`../../logging`);

const lambda = new aws.Lambda({ apiVersion: `2015-03-31` });

function functionConfiguration(functionName) {
    return lambda.getFunctionConfiguration({ FunctionName: functionName }).promise()
        .then(configuration => {
            Trace({ "This Lambda Function Configuration": configuration }, true);

            return configuration;
        });
}

module.exports.FunctionConfiguration = functionConfiguration;
