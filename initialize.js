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
        .then(() => loadConfiguration(extractionLocation));
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
                log.Debug(configuration, true);
                return configuration;
            } else
                return Promise.reject(`No configuration file found in either extracted source or function root`);
        });
}

module.exports.Initialize = initialize;
