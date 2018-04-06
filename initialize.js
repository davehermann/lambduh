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
        .then(configuration => sortConfigurationTasks(configuration))
        .then(configuration => filterTasksByIncludeOrExcludeConfiguration(configuration));
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
            switch (a.type.toLowerCase()) {
                // S3 always goes at the end
                case `s3`:
                    return 1;

                // Lambda always goes at the beginning
                case `lambda`:
                    return -1;

                // API Gateway should be after Lambda and before S3
                case `apigateway`:
                    return b.type.toLowerCase() === `lambda` ? 1 : -1;
            }
        }
    });

    // Remove the ordinal property
    configuration.tasks.forEach((task) => { delete task.initialTaskOrder; });

    log.Trace({ "Re-ordered Configuration": configuration }, true);

    return Promise.resolve(configuration);
}

function filterTasksByIncludeOrExcludeConfiguration(configuration) {
    if (!!configuration.taskFilters) {
        // Handle the includes first
        if (!!configuration.taskFilters.include) {
            // If Lambda functions are defined, filter the Lambda functions
            if (!!configuration.taskFilters.include.lambda) {
                let lambdaTasks = configuration.tasks.filter(task => { return (task.type.toLowerCase() == `lambda`); });

                lambdaTasks.forEach(task => {
                    task.functions = task.functions.filter(lambdaFunction => {
                        return (configuration.taskFilters.include.lambda.indexOf(lambdaFunction.name) >= 0);
                    });
                });
            }

            // If no API Gateway filter is specified, and a Lambda functions filter exists, automatically set to only the matching functions
            if (!configuration.taskFilters.include.apiGateway && !!configuration.taskFilters.include.lambda)
                configuration.taskFilters.include.apiGateway = configuration.taskFilters.include.lambda.map(functionName => {
                    return { "functionName": functionName };
                });

            // For API Gateway, filter can be path or function name, and can specify a method
            if (!!configuration.taskFilters.include.apiGateway) {
                let apiGatewayTasks = configuration.tasks.filter(task => { return (task.type.toLowerCase() == `apigateway`); }),
                    byPath = {},
                    byFunction = {};

                configuration.taskFilters.include.apiGateway.forEach(f => {
                    if (!!f.path)
                        byPath[f.path] = f;

                    if (!!f.functionName)
                        byFunction[f.functionName] = f;
                });

                apiGatewayTasks.forEach(task => {
                    if (!!task.aliasNonEndpoints) {
                        task.aliasNonEndpoints = task.aliasNonEndpoints.filter(lambdaFunction => { return !!byFunction[lambdaFunction.functionName]; });

                        if (task.aliasNonEndpoints.length == 0)
                            delete task.aliasNonEndpoints;
                    }

                    // Filter endpoints by path/function, and (if specified) by method
                    let pathEndpoints = task.endpoints.filter(endpoint => { return !!byPath[endpoint.path] && (!!byPath[endpoint.path].method ? (endpoint.method.toLowerCase() == byPath[endpoint.path].method.toLowerCase()) : true); }),
                        functionEndpoints = task.endpoints.filter(endpoint => { return !!byFunction[endpoint.functionName] && (!!byFunction[endpoint.functionName].method ? (endpoint.method.toLowerCase() == byFunction[endpoint.functionName].method.toLowerCase()) : true); });

                    // Combine endpoints into a final list by path-method pairs
                    let knownEndpoints = {};
                    pathEndpoints.forEach(endpoint => { knownEndpoints[`${endpoint.path}::${endpoint.method.toLowerCase()}`] = endpoint; });
                    functionEndpoints.forEach(endpoint => { knownEndpoints[`${endpoint.path}::${endpoint.method.toLowerCase()}`] = endpoint; });

                    task.endpoints = [];
                    for (let pathMethod in knownEndpoints)
                        task.endpoints.push(knownEndpoints[pathMethod]);
                    task.endpoints.sort((a, b) => { return a.path < b.path ? -1 : 1; });
                });
            }
        }

        // Excludes will be from whatever remains after the includes are processed
        if (!!configuration.taskFilters.exclude) {
            // TBD
        }
    }

    // Drop any task listed as disabled, or empty S3, Lambda, or API Gateway tasks
    configuration.tasks = configuration.tasks.filter(task => {
        let include = !task.disabled,
            taskType = task.type.toLowerCase();

        if ((taskType === `lambda`) && (!task.functions || (task.functions.length == 0)))
            include = false;

        if ((taskType === `apigateway`) && (!task.endpoints || (task.endpoints.length == 0)) && (!task.aliasNonEndpoints || (task.aliasNonEndpoints.length == 0)))
            include = false;

        return include;
    });

    log.Trace({ "Filtered Configuration": configuration }, true);

    return Promise.resolve(configuration);
}

module.exports.Initialize = initialize;
