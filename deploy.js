"use strict";

let aws = require("aws-sdk"),
    tar = require("tar"),
    fs = require("fs-extra"),
    zlib = require("zlib"),
    s3Task = require("./tasks/s3.js"),
    lambdaTask = require("./tasks/lambda.js"),
    apiGatewayTask = require("./tasks/apiGateway.js"),
    mime = require("mime-types"),
    uuid = require("uuid"),
    path = require("path"),
    log = require("./logger");

log.level = process.env.log || "warn";
const MAXLAMBDABUILDSPERFILE = process.env.lambdasPerTask || 10;
const THRESHOLDLAMBDABUILDSFORMULTIPLEFILES = !!process.env.minLambdaForSplit ? +process.env.minLambdaForSplit : 0;

global.log = log;

let localRoot = "/tmp/deployment",
    extractionLocation = localRoot + "/extract";

module.exports.lambda = function(evtData, context, callback) {
    global.log.Trace(JSON.stringify(evtData));

    launchedBy(evtData, context)
        .then(() => {
            callback();
        })
        .catch((err) => {
            global.log.Error(err);

            callback(err);
        });
}

function launchedBy(evtData, context) {
    // Determine if the source of the invocation is a configuration file
    // The source should always be an S3 record as the trigger will be either an archive to deploy, or the configuration file
    let s3Source = evtData.Records[0].s3,
        fileName = path.basename(s3Source.object.key);

    if (fileName.search(/^config\..*\.lambduh$/) >= 0)
        return continueArchive(evtData, context)
            .then((continuingConfiguration) => {
                return processArchive(continuingConfiguration.originalSource, context, continuingConfiguration);
            })
            ;
    else
        return processArchive(evtData, context);
}

function continueArchive(evtData, context) {
    let s3Source = evtData.Records[0].s3,
        fileName = path.basename(s3Source.object.key);

    global.log.Warn(`Continuing processing with "${s3Source.object.key} in ${s3Source.bucket.name}"`);

    let s3 = new aws.S3({ apiVersion: '2006-03-01' });
    return new Promise((resolve, reject) => {
        s3.getObject({ Bucket: s3Source.bucket.name, Key: s3Source.object.key }, (err, data) => {
            if (!!err)
                reject(err);
            else {
                // The body should be JSON
                let storedConfig = data.Body.toString(`utf8`);
                global.log.Trace(storedConfig);
                resolve(JSON.parse(storedConfig));
            }
        });
    })
    ;
}

function processArchive(evtData, context, preprocessedConfiguration) {
    let awsRegion = null,
        awsAccountId = null;

    return lambdaTask.FunctionConfiguration(context.functionName)
        .then((functionConfiguration) => {
            // Parse out the current region, and account ID
            let arnParts = functionConfiguration.FunctionArn.split(":");
            awsRegion = arnParts[3];
            awsAccountId = arnParts[4];

            global.log.Debug(`Running in ${awsRegion} for account id ${awsAccountId}`);
        })
        .then(() => {
            return cleanRoot();
        })
        .then(() => {
            return loadSource(evtData);
        })
        .then(() => {
            return loadConfiguration(preprocessedConfiguration);
        })
        .then((configuration) => {
            return splitProcessingAcrossSeveralInstances(configuration);
        })
        .then((taskFile) => {
            global.log.Trace(JSON.stringify(taskFile, null, 4));

            // If the taskFile only contains one entry, process it as the configuration
            if (taskFile.length == 1)
                return processConfiguration(taskFile, awsRegion, awsAccountId)
                    .then(() => {
                        if (!!preprocessedConfiguration && (preprocessedConfiguration.remainingSteps.length > 0))
                            return writeRemainingTasks(preprocessedConfiguration.remainingSteps, evtData);
                        else {
                            // Delete the generated configuration files
                            return Promise.resolve();
                        }
                    });
            // Otherwise, write it to the same S3 bucket as the archive
            else
                return writeRemainingTasks(taskFile, evtData);
        })
        ;
}

function splitProcessingAcrossSeveralInstances(configuration) {
    // Each task should be run as its own separate configuration file
    // Some tasks should be broken down into separate steps
    // This will prevent running out of memory or time on the Lambda instance

    let taskFile = [], newConfiguration = null;

    // Pre-check to see if there are less Lambda functions than the split-processing threshold
    let lambdaTasks = configuration.tasks.filter((task) => { return (task.type == "Lambda") && (task.functions.length > THRESHOLDLAMBDABUILDSFORMULTIPLEFILES); });

    if (lambdaTasks.length == 0)
        // Pass through the entire configuration as-is
        taskFile = [configuration];
    else
        configuration.tasks.forEach((task) => {
            if (!task.disabled) {
                // Each task will, by default, be its own separately processed configuration
                newConfiguration = new filePack(configuration);
                taskFile.push(newConfiguration);

                switch (task.type) {
                    // Lambda will split all functions into separate configurations of MAXLAMBDABUILDSPERFILE
                    case "Lambda":
                        // Create a copy of the array of functions
                        let definedFunctions = task.functions.filter(() => { return true; });

                        let lambdaTask = duplicateLambdaTask(task);
                        newConfiguration.tasks.push(lambdaTask);

                        while (definedFunctions.length > 0) {
                            if (lambdaTask.functions.length >= MAXLAMBDABUILDSPERFILE) {
                                newConfiguration = new filePack(configuration);
                                taskFile.push(newConfiguration);

                                lambdaTask = duplicateLambdaTask(task);
                                newConfiguration.tasks.push(lambdaTask);
                            }

                            let thisFunction = definedFunctions.shift();
                            lambdaTask.functions.push(thisFunction);
                        }
                        break;

                    default:
                        newConfiguration.tasks.push(task);
                        break;
                }
            }
        });

    return taskFile;
}

function writeRemainingTasks(taskFile, evtData) {
    global.log.Debug(`Writing remaining tasks to file for next run of this service`);
    global.log.Trace(JSON.stringify(evtData));

    let saveConfiguration = new (function() {
        this.originalSource = evtData;
        this.remainingSteps = taskFile;
    })();

    let s3 = new aws.S3({ apiVersion: '2006-03-01' });

    return new Promise((resolve, reject) => {
        let objectConfig = new (function() {
            let oc = this;

            oc.Bucket = evtData.Records[0].s3.bucket.name;
            oc.Key = `config.${uuid.v4()}.lambduh`;
            oc.Body = JSON.stringify(saveConfiguration, null, 4);
            oc.ContentType = mime.lookup("txt");
        })();
        s3.putObject(objectConfig, (err, data) => {
            if (!!err)
                reject(err);
            else
                resolve(data);
        });
    });
}

function processConfiguration(taskFile, awsRegion, awsAccountId) {
    let configuration = taskFile[0];

    configuration.cwd = __dirname;
    configuration.awsRegion = awsRegion;
    configuration.awsAccountId = awsAccountId;

    return runTasks(configuration);
}

function duplicateLambdaTask(task) {
    let lambdaTask = new filePack(task);

    lambdaTask.functions = [];

    return lambdaTask;
}

function filePack(configuration) {
    for (let prop in configuration)
        switch (prop) {
            case `tasks`:
                this.tasks = [];
                break;

            default:
                this[prop] = configuration[prop];
        }
}

function cleanRoot() {
    global.log.Trace(`Checking ${localRoot} for any prior runs of this instance with remaining data`);

    return new Promise((resolve, reject) => {
        fs.stat(localRoot, (err, stats) => {
            if (!!err && (err.message.search(/no such file or directory/g) >= 0))
                resolve(null);
            else if (!!err)
                reject(err);
            else
                resolve(stats);
        });
    })
    .then((stats) => {
        if (!stats)
            return null;
        else {
            global.log.Trace(`Cleaning ${localRoot} of found data`);

            // Delete the existing directory
            return new Promise((resolve, reject) => {
                fs.remove(localRoot, (err) => {
                    if (!!err)
                        reject(err);
                    else
                        resolve();
                });
            });
        }
    })
}

function loadSource(evtData) {
    if (!!evtData.Records && !!evtData.Records[0].s3)
        // Assume only one item triggering at a time
        return extractFiles(evtData.Records[0].s3);
}

function extractFiles(s3Description) {
    global.log.Trace(`Extracting source`);

    return new Promise((resolve, reject) => {
        // Get the file
        let s3 = new aws.S3({ apiVersion: '2006-03-01' });

        if (s3Description.object.key.search(/\.tar/g) >= 0) {
            // Tarballs
            let extract = tar.Extract({ path: extractionLocation })
                .on("error", function(err) {
                    global.log.Error(err);
                    reject(err);
                })
                .on("end", function() {
                    global.log.Trace("...extract complete");

                    resolve();
                });

            if (s3Description.object.key.search(/\.gz/g) >= 0) {
                // Gzipped Tarballs
                let gunzip = zlib.createGunzip();

                var s3Stream = s3.getObject({ Bucket: s3Description.bucket.name, Key: s3Description.object.key })
                    .createReadStream()
                    .pipe(gunzip)
                    .pipe(extract);
            } else {
                var s3Stream = s3.getObject({ Bucket: s3Description.bucket.name, Key: s3Description.object.key })
                    .createReadStream()
                    .pipe(extract);
            }
        }
    });
}

function loadConfiguration(preprocessedConfiguration) {
    if (!!preprocessedConfiguration) {
        return preprocessedConfiguration.remainingSteps.shift();
    } else
        return new Promise((resolve, reject) => {
            // Check extracted files for "lamb_duh.json"
            fs.readFile(extractionLocation + "/lamb_duh.json", "utf8", (err, configurationFileContents) => {
                if (!!err && (err.message.search(/no such file or directory/g) >= 0))
                    resolve(null);
                else if (!!err)
                    reject(err);
                else
                    resolve(configurationFileContents);
            });
        })
            .then((extractConfiguration) => {
                if (!!extractConfiguration)
                    return extractConfiguration;
                else
                    return new Promise((resolve, reject) => {
                        // Check the function local files for "configuration.json"
                        fs.readFile(__dirname + "/configuration.json", "utf8", (err, configurationFileContents) => {
                            if (!!err && (err.message.search(/no such file or directory/g) >= 0))
                                resolve(null);
                            else if (!!err)
                                reject(err);
                            else
                                resolve(configurationFileContents);
                        });
                    });
            })
            .then((configurationFileContents) => {
                if (!!configurationFileContents)
                    return JSON.parse(configurationFileContents);
                else
                    throw "No configuration file found in either extracted source or function root";
            });
}

function runTasks(configuration) {
    return new Promise((resolve, reject) => {
        (function processTask() {
            if (configuration.tasks.length > 0) {
                let task = configuration.tasks.shift();

                if (task.disabled)
                    processTask();
                else {
                    let taskPromise = null;

                    switch (task.type) {
                        case "S3":
                            taskPromise = s3Task.Task(task, extractionLocation);
                            break;

                        case "Lambda":
                            taskPromise = lambdaTask.Task(task, extractionLocation, localRoot, configuration);
                            break;

                        case "ApiGateway":
                            taskPromise = apiGatewayTask.Task(task, configuration);
                            break;
                    }

                    taskPromise
                        .then(() => {
                            processTask();
                        })
                        .catch((err) => {
                            reject(err);
                        })
                }
            } else
                resolve();
        })();
    });
}
