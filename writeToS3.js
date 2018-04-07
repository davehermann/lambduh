"use strict";

const aws = require(`aws-sdk`),
    { Trace, Debug } = require(`./logging`);

const s3 = new aws.S3({ apiVersion: `2006-03-01` });

function removeProcessingFiles(s3Source, remainingTasks) {
    Debug(`Removing all files related to processing this archive`);

    return listFilesForArchiveProcessing(s3Source.bucket.name, remainingTasks.startTime.valueOf() + ``)
        .then(foundFiles => {
            Trace({ "Files to be removed": foundFiles }, true);
            return foundFiles;
        })
        .then(foundFiles => removeFiles(s3Source.bucket.name, foundFiles));
}

function listFilesForArchiveProcessing(Bucket, Prefix, foundFiles, ContinuationToken) {
    if (!foundFiles || !!ContinuationToken) {
        let params = {
            Bucket,
            Prefix,
            ContinuationToken
        };
        return s3.listObjectsV2(params).promise()
            .then(data => {
                if (!foundFiles)
                    foundFiles = [];

                foundFiles = foundFiles.concat(data.Contents);

                return listFilesForArchiveProcessing(Bucket, Prefix, foundFiles, data.NextContinuationToken);
            });
    } else
        return Promise.resolve(foundFiles);
}

function removeFiles(Bucket, remainingFiles) {
    if (remainingFiles.length > 0) {
        let filesToDelete = [];
        while ((filesToDelete.length < 500) && (remainingFiles.length > 0))
            filesToDelete.push(remainingFiles.shift());

        return s3.deleteObjects({ Bucket, Delete: { Objects: filesToDelete.map(file => { return { Key: file.Key }; }) } }).promise()
            .then(() => removeFiles(Bucket, remainingFiles));
    } else {
        Debug(`All files removed`);
        return Promise.resolve();
    }
}

function writeRemainingTasks(remainingTasks, originalSource) {
    Debug(`Writing remaining tasks to S3 for next run of this service`);

    // Set the timestamp to its integer value
    remainingTasks.startTime = remainingTasks.startTime.valueOf();

    let saveConfiguration = { originalSource, remainingTasks };
    Trace({ "To S3": saveConfiguration }, true);

    let params = {
        Bucket: originalSource.Records[0].s3.bucket.name,
        Key: `${remainingTasks.startTime}/remainingTasks/${(remainingTasks.index + ``).padStart(5, `0`)}.lambduh.txt`,
        ContentType: `text/plain`,
        Body: JSON.stringify(saveConfiguration, null, 4)
    };

    return s3.putObject(params).promise();
}

module.exports.ListFilesInBucket = listFilesForArchiveProcessing;
module.exports.RemoveProcessingFiles = removeProcessingFiles;
module.exports.RemoveFiles = removeFiles;
module.exports.WriteRemainingTasks = writeRemainingTasks;
