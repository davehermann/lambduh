"use strict";

const aws = require(`aws-sdk`),
    { Trace, Debug } = require(`./logging`);

const s3 = new aws.S3({ apiVersion: `2006-03-01` });

function writeRemainingTasks(remainingTasks, originalSource) {
    Debug(`Writing remaining tasks to S3 for next run of this service`);

    // Set the timestamp to its integer value
    remainingTasks.startTime = remainingTasks.startTime.valueOf();

    let saveConfiguration = { originalSource, remainingTasks };
    Trace({ "To S3": saveConfiguration }, true);

    let params = {
        Bucket: originalSource.Records[0].s3.bucket.name,
        Key: `${remainingTasks.startTime}/remainingTasks/lambduh.${(remainingTasks.index + ``).padStart(5, `0`)}.txt`,
        ContentType: `text/plain`,
        Body: JSON.stringify(saveConfiguration, null, 4)
    };

    return s3.putObject(params).promise();
}

module.exports.WriteRemainingTasks = writeRemainingTasks;
