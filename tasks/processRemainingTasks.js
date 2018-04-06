"use strict";

const aws = require(`aws-sdk`),
    { DateTime } = require(`luxon`),
    { Trace, Warn } = require(`../logging`),
    { RemoveProcessingFiles } = require(`../writeToS3`);

const s3 = new aws.S3({ apiVersion: `2006-03-01` });

function processNextFile(evtData, localRoot, extractionLocation) {
    let s3Source = evtData.Records[0].s3;

    Warn(`Continuing processing with "${s3Source.object.key} in ${s3Source.bucket.name}"`);

    return loadFile(s3Source.bucket.name, s3Source.object.key)
        .then(configuration => {
            configuration.remainingTasks.startTime = DateTime.fromMillis(configuration.remainingTasks.startTime);

            return configuration;
        })
        .then(configuration => nextTask(configuration, s3Source));
}

function loadFile(Bucket, Key) {
    return s3.getObject({ Bucket, Key }).promise()
        .then(s3Data => {
            // The body will be JSON
            let storedConfiguration = JSON.parse(s3Data.Body.toString(`utf8`));
            Trace({ "Loaded Configuration": storedConfiguration }, true);

            return storedConfiguration;
        });
}

function nextTask(configuration, s3Source) {
    if (configuration.remainingTasks.tasks.length > 0) {

    } else
        return RemoveProcessingFiles(s3Source, configuration.remainingTasks);
}

module.exports.NextSteps = processNextFile;
