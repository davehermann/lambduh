"use strict";

const aws = require(`aws-sdk`),
    fs = require(`fs-extra`),
    tar = require(`tar`),
    { FunctionConfiguration } = require(`./tasks/lambda/lambda`),
    log = require(`./logging`);

const s3 = new aws.S3({ apiVersion: `2006-03-01` });

function initialize(evtData, context, localRoot, extractionLocation) {
    let awsRegion = null,
        awsAccountId = null;

    // Get the configuration for this Lambda function
    return FunctionConfiguration(context.functionName)
        .then(thisFunctionConfiguration => {
            // Parse the current region, and account ID, from this function's ARN
            let arnParts = thisFunctionConfiguration.FunctionArn.split(`:`);
            awsRegion = arnParts[3];
            awsAccountId = arnParts[4];

            log.Debug(`Running in ${awsRegion} for account id ${awsAccountId}`);
        })
        // Remove temporary files
        .then(() => cleanTemporaryRoot(localRoot))
        .then(() => extractArchive(evtData.Records[0].s3, extractionLocation))
        .then(() => loadConfiguration(extractionLocation))
        .then(configuration => sortConfigurationTasks(configuration));
}

// Clean any existing files that may exist from prior execution of this instance
function cleanTemporaryRoot(localRoot) {
    log.Trace(`Checking ${localRoot} for any prior runs of this instance with remaining data`);

    // Use fs.stat to check for the existance of the temporary directory
    return fs.stat(localRoot)
        .then(() => {
            // If the directory exists, it needs to be removed
            log.Trace(`Cleaning ${localRoot} of found data`);

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

// Extract the archive used to start processing
function extractArchive(s3Record, extractionLocation) {
    log.Trace(`Extracting Code Archive`);

    let pExtract = fs.ensureDir(extractionLocation);

    // Support for tarballs
    if (s3Record.object.key.search(/\.tar/g) >= 0) {
        pExtract = pExtract
            .then(() => {
                return new Promise((resolve, reject) => {
                    let extractor = tar.extract({ cwd: extractionLocation })
                        .on(`error`, err => {
                            log.Error(err);
                            reject(err);
                        })
                        .on(`end`, () => {
                            log.Trace(`...extract complete`);
                            resolve();
                        });

                    s3.getObject({ Bucket: s3Record.bucket.name, Key: s3Record.object.key })
                        .createReadStream()
                        .pipe(extractor);
                });
            });
    }

    return pExtract;
}

function loadConfiguration(extractionLocation) {
    // Read ~/lamb_duh.json from the extracted files
    return fs.readFile(`${extractionLocation}/lamb_duh.json`, `utf8`)
        .then(configurationFileContents => {
            if (!!configurationFileContents) {
                let configuration = JSON.parse(configurationFileContents);
                log.Debug({ "Loaded Configuration": configuration }, true);
                return configuration;
            } else
                return Promise.reject(`No configuration file found in either extracted source or function root`);
        });
}

function sortConfigurationTasks(configuration) {
    // First, sort tasks to move Lambda tasks to the front, followed by API Gateway, and then all S3 tasks
    // Maintain existing order, other than those changes

    // Add an ordinal property
    configuration.tasks.forEach((task, idx) => { task.initialTaskOrder = idx; });

    // Sort by task type
    configuration.tasks.sort((a, b) => {
        if (a.type === b.type)
            return a.initialTaskOrder - b.initialTaskOrder;
        else {
            switch (a.type) {
                // S3 always goes at the end
                case `S3`:
                    return 1;

                // Lambda always goes at the beginning
                case `Lambda`:
                    return -1;

                // API Gateway should be after Lambda and before S3
                case `ApiGateway`:
                    return b.type === `Lambda` ? 1 : -1;
            }
        }
    });

    // Remove the ordinal property
    configuration.tasks.forEach((task) => { delete task.initialTaskOrder; });

    log.Trace({ "Re-ordered Configuration": configuration }, true);

    return Promise.resolve(configuration);
}

module.exports.Initialize = initialize;
