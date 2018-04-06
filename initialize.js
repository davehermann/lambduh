"use strict";

const fs = require(`fs-extra`),
    { FunctionConfiguration } = require(`./tasks/lambda/lambda`),
    { Trace, Debug } = require(`./logging`);

function initialize(context, localRoot) {
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
        })
        // Remove temporary files
        .then(() => cleanTemporaryRoot(localRoot));
}

// Clean any existing files that may exist from prior execution of this instance
function cleanTemporaryRoot(localRoot) {
    Trace(`Checking ${localRoot} for any prior runs of this instance with remaining data`);

    // Use fs.stat to check for the existance of the temporary directory
    return fs.stat(localRoot)
        .then(() => {
            // If the directory exists, it needs to be removed
            Trace(`Cleaning ${localRoot} of found data`);

            return fs.remove(localRoot);
        })
        .catch(err => {
            // If the directory does not exist, fs.stat throws and error and we can continue
            if (err.message.search(/no such file or directory/g) >= 0)
                return null;
            else
                // Throw any other errors
                return Promise.reject(err);
        });
}

module.exports.Initialize = initialize;
