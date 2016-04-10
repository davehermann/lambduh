"use strict";

let aws = require("aws-sdk"),
    tar = require("tar"),
    fs = require("fs"),
    rimraf = require("rimraf"),
    s3Task = require("./tasks/s3.js");

let localRoot = "/tmp/deployment",
    extractionLocation = localRoot + "/extract";

module.exports.lambda = function(evtData, context, callback) {
    cleanRoot()
        .then(() => {
            // Assume only one item triggering at a time
            return extractFiles(evtData.Records[0].s3)
        })
        .then(() => {
            return loadConfiguration();
        })
        .then((configuration) => {
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
                rimraf([localRoot], (err) => {
                    if (!!err)
                        reject(err);
                    else
                        resolve();
                });
            });
        }
    })
}

function extractFiles(s3Description) {
    return new Promise((resolve, reject) => {
        // Get the file
        let s3 = new aws.S3({ apiVersion: '2006-03-01' });

        let extract = tar.Extract({ path: extractionLocation })
            .on("error", function(err) {
                console.log(err);
                reject(err);
            })
            .on("end", function() {
                console.log("Extract Complete");
                resolve();
            });

        s3.getObject({ Bucket: s3Description.bucket.name, Key: s3Description.object.key })
            .createReadStream()
            .pipe(extract);
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
    let taskList = [];

    configuration.tasks.forEach((task) => {
        let taskPromise = null;

        switch (task.type) {
            case "S3":
                taskPromise = s3Task(task, extractionLocation);
                break;
        }

        taskList.push(taskPromise);
    })

    return Promise.all(taskList);
}
