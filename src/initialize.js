"use strict";

// Node Modules
const fs = require(`fs`);

// NPM Modules
const { DateTime } = require(`luxon`);

// Application Modules
const { CleanTemporaryRoot, ExtractArchive } = require(`./extractArchive`),
    log = require(`./logging`),
    { SetNotificationConfiguration, StartupNotification } = require(`./notifications`),
    { FunctionConfiguration } = require(`./tasks/lambda/lambda`),
    { WriteExtractedArchiveToS3, WriteRemainingTasks } = require(`./writeToS3`);

function initialize(evtData, context, localRoot, extractionLocation) {
    let s3Source = evtData.Records[0].s3,
        awsRegion = null,
        awsAccountId = null,
        functionTimeout = null,
        startTime = DateTime.utc();

    log.Warn(`Lamb_duh deployment triggered via ${s3Source.object.key}`);

    // Get the configuration for this Lambda function
    return FunctionConfiguration(context.functionName)
        .then(thisFunctionConfiguration => {
            functionTimeout = thisFunctionConfiguration.Timeout;

            // Parse the current region, and account ID, from this function's ARN
            let arnParts = thisFunctionConfiguration.FunctionArn.split(`:`);
            awsRegion = arnParts[3];
            awsAccountId = arnParts[4];

            log.Debug(`Running in ${awsRegion} for account id ${awsAccountId}`);
        })
        // Remove temporary files
        .then(() => CleanTemporaryRoot(localRoot))
        .then(() => ExtractArchive(s3Source, extractionLocation))
        .then(() => loadConfiguration(extractionLocation))
        .then(configuration => sortConfigurationTasks(configuration))
        .then(configuration => filterTasksByIncludeOrExcludeConfiguration(configuration))
        .then(configuration => {
            // Add data to be tracked as part of the continuing tasks
            configuration.index = -1;
            configuration.awsRegion = awsRegion;
            configuration.awsAccountId = awsAccountId;
            configuration.startTime = startTime;
            configuration.functionTimeout = functionTimeout;

            return configuration;
        })
        .then(configuration => {
            SetNotificationConfiguration(configuration);

            return StartupNotification()
                .then(() => { return configuration; });
        })
        // Write the extracted archive to S3
        .then(configuration => {
            return WriteExtractedArchiveToS3(s3Source, extractionLocation, startTime)
                .then(() => { return configuration; });
        })
        // Write the initial task file to S3
        .then(configuration => WriteRemainingTasks(configuration, evtData));
}

function loadConfiguration(extractionLocation) {
    // Read ~/lamb-duh.configuration.json from the extracted files
    return fs.promises.readFile(`${extractionLocation}/lamb-duh.configuration.json`, `utf8`)
        .then(configurationFileContents => {
            let configuration = JSON.parse(configurationFileContents);
            log.Dev({ "Loaded Configuration": configuration }, true);
            return configuration;
        })
        .catch(err => {
            if (err.code == `ENOENT`)
                return Promise.reject(new Error(`No configuration file found in extracted source`));
            else
                return Promise.reject(err);
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

    log.Dev({ "Re-ordered Configuration": configuration }, true);

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

    log.Debug({ "Filtered Configuration": configuration }, true);

    return Promise.resolve(configuration);
}

module.exports.Initialize = initialize;
