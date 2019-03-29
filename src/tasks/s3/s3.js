"use strict";

const aws = require(`aws-sdk`),
    mime = require(`mime-types`),
    path = require(`path`),
    uuid = require(`uuid`),
    { Trace, Debug, Info, Warn } = require(`../../logging`),
    { GetPathForArchive, ListFilesInBucket, RemoveFiles } = require(`../../writeToS3`);

const s3 = new aws.S3({ apiVersion: `2006-03-01` });

function s3Task(task, remainingTasks, s3Source) {
    Trace({ Task: task }, true);

    let taskSource = task.source;
    if (taskSource.search(/^\//) == 0)
        taskSource = taskSource.substr(1);

    if (taskSource.search(/\/$/) > 0)
        taskSource = taskSource.substr(0, taskSource.length - 2);

    let sourceS3Path = `${GetPathForArchive(remainingTasks.startTime.valueOf())}/${taskSource}/`;

    return ListFilesInBucket(s3Source.bucket.name, sourceS3Path)
        .then(foundFiles => {
            Trace({ "Files to Transfer": foundFiles }, true);

            Warn(`Transfering ${task.source} from extracted archive to ${JSON.stringify(task.dest)}`);

            return copyS3ObjectsToDestination(foundFiles, task, s3Source.bucket.name, sourceS3Path);
        })
        .then(sourceKeys => cleanUnusedFiles(sourceKeys, task));
}

function copyS3ObjectsToDestination(foundFiles, task, s3SourceBucket, sourceS3Path, sourceKeys) {
    if (!sourceKeys)
        sourceKeys = [];

    if (foundFiles.length > 0) {
        let nextFile = foundFiles.shift();

        let relativePath = nextFile.Key.replace(sourceS3Path, ``),
            Key = relativePath;

        // Write to a key prefix, if a prefix is defined
        if (!!task.dest.key)
            // Remove a leading or trail slash
            Key = `${task.dest.key.replace(/^\//, ``).replace(/\/$/, ``)}/${Key}`;

        sourceKeys.push(Key);

        let copyParams = {
            CopySource: encodeURI(`/${s3SourceBucket}/${nextFile.Key}`),
            Bucket: task.dest.bucket,
            Key,
            CacheControl: !!task.cacheControl ? task.cacheControl : `no-cache`
        };

        let mimeType = mime.lookup(path.extname(relativePath));
        if (!!mimeType)
            copyParams.ContentType = mimeType;

        copyParams.Metadata = {
            "Cache-Control": copyParams.CacheControl,
            ETag: uuid.v4()
        };

        Trace({ "Copying S3 Object": copyParams }, true);
        return s3.copyObject(copyParams).promise()
            .then(() => copyS3ObjectsToDestination(foundFiles, task, s3SourceBucket, sourceS3Path, sourceKeys));
    } else
        return Promise.resolve(sourceKeys);
}

function cleanUnusedFiles(sourceKeys, task) {
    // Load the entire list of keys from S3
    var keyList = { Bucket: task.dest.bucket };
    if (!!task.dest.key)
        keyList.Prefix = task.dest.key;

    Trace({ "Files from source": sourceKeys }, true);
    Info(`Cleaning removed items from ${JSON.stringify(keyList)}`);

    return ListFilesInBucket(keyList.Bucket, keyList.Prefix)
        .then(foundObjects => {
            Debug(`${foundObjects.length} files in bucket; ${sourceKeys.length} in source`);
            Trace({ "All files in bucket": foundObjects.map(file => { return file.Key; }) }, true);
            return foundObjects;
        })
        .then(foundObjects => {
            let removeObjects = foundObjects.filter(file => { return sourceKeys.indexOf(file.Key) < 0; });
            Debug(`Removing ${removeObjects.length} files`);
            Trace({ "S3 Objects to be removed": removeObjects.map(file => { return file.Key; }) }, true);

            return RemoveFiles(keyList.Bucket, removeObjects);
        });
}

module.exports.S3Task = s3Task;
