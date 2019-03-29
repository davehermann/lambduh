"use strict";

const aws = require(`aws-sdk`),
    fs = require(`fs-extra`),
    { DateTime } = require(`luxon`),
    mime = require(`mime-types`),
    path = require(`path`),
    { ReadDirectoryContents } = require(`./scanDirectory`),
    { Trace, Debug, Warn } = require(`./logging`);

const s3 = new aws.S3({ apiVersion: `2006-03-01` });

function removeProcessingFiles(s3Source, remainingTasks) {
    Warn(`Removing all files related to processing this archive`);

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
        Key: `${remainingTasks.startTime}/remainingTasks/${(remainingTasks.index + ``).padStart(5, `0`)}.lamb-duh.txt`,
        ContentType: `text/plain`,
        Body: JSON.stringify(saveConfiguration, null, 4)
    };

    return s3.putObject(params).promise();
}

function writeArchive(s3Source, extractionLocation, startTime) {
    return ReadDirectoryContents(extractionLocation)
        .then(foundFiles => {
            Trace({ "Extracted Archive": foundFiles }, true);
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

function deploymentHistory(configuration) {
    // Do nothing if the configuration explicitly blocks archiving
    if (!!configuration.remainingTasks.history && configuration.remainingTasks.history.noHistory)
        return Promise.resolve();

    let uploadedToS3 = configuration.originalSource.Records[0].s3,
        // Get the bucket name, and object key
        bucket = uploadedToS3.bucket.name,
        fileKey = uploadedToS3.object.key,
        // Get the file name
        filename = path.basename(fileKey),
        // Copy to "Lamb-duh_archive/APPLICATION_NAME/DATESTAMP/FILE_NAME"
        copyTo = `${fileKey.replace(filename, ``)}Lamb-duh_archive/${configuration.remainingTasks.applicationName}/${DateTime.fromMillis(+configuration.remainingTasks.startTime).toISO()}/${filename}`;

    // Copy the file
    let copyParams = {
        CopySource: `/${bucket}/${fileKey}`,
        Bucket: bucket,
        Key: copyTo,
    };

    Debug({ [`Copy source upload to`]: copyParams });

    return s3.copyObject(copyParams).promise()
        .then(() => {
            let deleteOriginal = {
                Bucket: bucket,
                Key: fileKey,
            };

            Debug({ [`Remove source`]: deleteOriginal });

            return s3.deleteObject(deleteOriginal).promise();
        });
}

module.exports.ListFilesInBucket = listFilesForArchiveProcessing;
module.exports.RemoveProcessingFiles = removeProcessingFiles;
module.exports.RemoveFiles = removeFiles;
module.exports.WriteRemainingTasks = writeRemainingTasks;
module.exports.WriteExtractedArchiveToS3 = writeArchive;
module.exports.GetPathForArchive = archivePath;
module.exports.DeploymentHistory = deploymentHistory;
