"use strict";

let aws = require("aws-sdk"),
    tar = require("tar"),
    fs = require("fs-extra"),
    zlib = require("zlib"),
    s3Task = require("./tasks/s3.js"),
    lambdaTask = require("./tasks/lambda.js"),
    apiGatewayTask = require("./tasks/apiGateway.js");

let localRoot = "/tmp/deployment",
    extractionLocation = localRoot + "/extract";

module.exports.lambda = function(evtData, context, callback) {
    let awsRegion = null,
        awsAccountId = null;

    lambdaTask.FunctionConfiguration(context.functionName)
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
            return loadConfiguration();
        })
        .then((configuration) => {
            configuration.cwd = __dirname;
            configuration.awsRegion = awsRegion;
            configuration.awsAccountId = awsAccountId;

            return runTasks(configuration);
        })
        .then(() => {
            callback();
        })
        .catch((err) => {
            console.log(err);
            callback(err);
        });
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

function loadConfiguration() {
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
                    resolve();
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
