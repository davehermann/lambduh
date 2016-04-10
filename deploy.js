"use strict";

let aws = require("aws-sdk"),
    tar = require("tar"),
    configuration = require("./configuration.json"),
    s3Task = require("./tasks/s3.js");

let extractionLocation = "/tmp/deployment";

module.exports.lambda = function(evtData, context, callback) {
    // Assume only one item triggering at a time
console.log(evtData.Records[0].s3);
    extractFiles(evtData.Records[0].s3)
        .then(() => {
            return runTasks();
        })
        .then(() => {
            callback();
        })
        .catch((err) => {
            console.log(err);
            callback(err);
        });
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

function runTasks() {
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
