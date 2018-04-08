"use strict";

const aws = require(`aws-sdk`),
    fs = require(`fs-extra`),
    mime = require(`mime-types`),
    path = require(`path`),
    { ReadDirectoryContents } = require(`./extractArchive`),
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

    // Increment the index
    remainingTasks.index++;

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

function writeArchive(s3Source, extractionLocation, startTime) {
    return ReadDirectoryContents(extractionLocation)
        .then(foundFiles => {
            Debug({ "Extracted Archive": foundFiles }, true);
            Debug(`Writing archive to S3`);
            return foundFiles;
        })
        .then(foundFiles => writeSystemFilesToS3(s3Source, extractionLocation, startTime.valueOf(), foundFiles))
        .then(() => { Debug(`...archive written`); });
}

function writeSystemFilesToS3(s3Source, extractionLocation, startTime, remainingFiles) {
    if (remainingFiles.length > 0) {
        let nextFile = remainingFiles.shift();

        return fs.readFile(nextFile)
            .then(fileContents => {
                let objectParams = {
                    Bucket: s3Source.bucket.name,
                    Key: `${archivePath(startTime)}/${nextFile.replace(`${extractionLocation}/`, ``)}`,
                    Body: fileContents
                };

                let mimeType = mime.lookup(path.extname(nextFile));
                if (!!mimeType)
                    objectParams.ContentType = mimeType;

                return s3.putObject(objectParams).promise();
            })
            .then(() => writeSystemFilesToS3(s3Source, extractionLocation, startTime, remainingFiles));
    } else
        return Promise.resolve();
}

function archivePath(startTime) {
    return `${startTime}/archive`;
}

module.exports.ListFilesInBucket = listFilesForArchiveProcessing;
module.exports.RemoveProcessingFiles = removeProcessingFiles;
module.exports.RemoveFiles = removeFiles;
module.exports.WriteRemainingTasks = writeRemainingTasks;
module.exports.WriteExtractedArchiveToS3 = writeArchive;
module.exports.GetPathForArchive = archivePath;
