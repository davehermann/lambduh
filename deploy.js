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
    path = require("path");

let localRoot = "/tmp/deployment",
    extractionLocation = localRoot + "/extract";

const MAXLAMBDABUILDSPERFILE = 10;

module.exports.lambda = function(evtData, context, callback) {
    launchedBy(evtData, context)
        .then(() => {
            callback();
        })
        .catch((err) => {
            console.log(err);
            callback(err);
        });
}

function launchedBy(evtData, context) {
    // Determine if the source of the invocation is a configuration file
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

    console.log(`Continuing processing with "${s3Source.object.key} in ${s3Source.bucket.name}"`);

    let s3 = new aws.S3({ apiVersion: '2006-03-01' });
    return new Promise((resolve, reject) => {
        s3.getObject({ Bucket: s3Source.bucket.name, Key: s3Source.object.key }, (err, data) => {
            if (!!err)
                reject(err);
            else {
                let storedConfig = data.Body.toString(`utf8`);
                console.log(storedConfig);
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
            // To prevent running out of memory, rewrite the configuration file as-needed
            let taskFile = [createFilePack(configuration)], lambdaCount = 0;

            let addLambdaTask = (task) => {
                let addTask = duplicateTask(task);
                addTask.functions = [];
                taskFile[taskFile.length - 1].tasks.push(addTask);

                return addTask;
            }

            configuration.tasks.forEach((task) => {
                if (!task.disabled) {
                    if (task.type == `Lambda`) {
                        let addTask = addLambdaTask(task);

                        task.functions.forEach((thisFunction) => {
                            if (lambdaCount >= MAXLAMBDABUILDSPERFILE) {
                                lambdaCount = 0;

                                taskFile.push(createFilePack(configuration));

                                addTask = addLambdaTask(task);
                            }

                            addTask.functions.push(thisFunction);

                            lambdaCount++;
                        });
                    } else
                        taskFile[taskFile.length - 1].tasks.push(task);
                }
            })
            ;

            return taskFile;
        })
        .then((taskFile) => {
            console.log(JSON.stringify(taskFile, null, 4));

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

function writeRemainingTasks(taskFile, evtData) {
    console.log(JSON.stringify(evtData));

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

function duplicateTask(task) {
    return createFilePack(task);
}
function createFilePack(configuration) {
    return new (function() {
        for (let prop in configuration)
            switch (prop) {
                case `tasks`:
                    this[prop] = [];
                    break;

                default:
                    this[prop] = configuration[prop];
            }
    })();
}

function cleanRoot() {
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
    return new Promise((resolve, reject) => {
        // Get the file
        let s3 = new aws.S3({ apiVersion: '2006-03-01' });

        if (s3Description.object.key.search(/\.tar/g) >= 0) {
            // Tarballs
            let extract = tar.Extract({ path: extractionLocation })
                .on("error", function(err) {
                    console.log(err);
                    reject(err);
                })
                .on("end", function() {
                    console.log("Extract Complete");
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
