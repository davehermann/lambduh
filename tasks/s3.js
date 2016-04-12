"use strict";

let fs = require("fs"),
    aws = require("aws-sdk");

function s3Task(task, extractionLocation) {
    return new Promise((resolve, reject) => {
        // Read the files in the path
        let sourceKeys = [];

        readDirectory(extractionLocation + task.source, extractionLocation + task.source, task, sourceKeys)
            .then(() => {
                return cleanUnusedFiles(sourceKeys, task);
            })
            .then(() => {
                resolve();
            })
            .catch((err) => {
                reject(err);
            });
    });
}

function readDirectory(path, rootPath, task, sourceKeys) {
    return new Promise((resolve, reject) => {
        fs.readdir(path, (err, files) => {
            if (!!err)
                reject(err);
            else
                resolve(files);
        });
    })
    .then((files) => {
        return directoryContents(files, path, rootPath, task, sourceKeys);
    });
}

function directoryContents(files, path, rootPath, task, sourceKeys) {
    let fileHandler = [];

    files.forEach((fileName) => {
        let objectPath = path + "/" + fileName;
        let stats = fs.statSync(objectPath);

        if (stats.isFile())
            fileHandler.push(handleFile(rootPath, objectPath, task, sourceKeys));
        else if (stats.isDirectory())
            fileHandler.push(handleDirectory(rootPath, objectPath, task, sourceKeys));
    });

    return Promise.all(fileHandler);
}

function handleFile(rootPath, filePath, task, sourceKeys) {
    let relativePath = filePath.replace(rootPath + "/", "");
    if (!!task.dest.key)
        relativePath = task.dest.key + "/" + relativePath;

    sourceKeys.push(relativePath);

// console.log(`${filePath} is a file going to ${relativePath} in ${task.dest.bucket}`);

    return new Promise((resolve, reject) => {
        let s3 = new aws.S3({ apiVersion: '2006-03-01' });

        fs.readFile(filePath, (err, fileContents) => {
            if (!!err)
                reject(err);
            else {
                let objectConfig = new (function() {
                    this.Bucket = task.dest.bucket;
                    this.Key = relativePath;
                    this.Body = fileContents;
                })();
                s3.putObject(objectConfig, (err, putData) => {
                    if (!!err)
                        reject(err);
                    else
                        resolve(putData);
                });
            }
        });
    });
}

function handleDirectory(rootPath, directoryPath, task, sourceKeys) {
// console.log(`${directoryPath} is a directory`);

    return readDirectory(directoryPath, rootPath, task, sourceKeys);
    // return null;
}

function cleanUnusedFiles(sourceKeys, task) {
    return new Promise((resolve, reject) => {
        // Load the entire list of keys from S3
        var keyList = { Bucket: task.dest.bucket };
        if (!!task.dest.key)
            keyList.Prefix = task.dest.key;

        let s3 = new aws.S3({ apiVersion: '2006-03-01' });

        let foundKeys = [];

        (function loadKeys(lastKey) {
            if (!!lastKey)
                keyList.Marker = lastKey;
            s3.listObjects(keyList, (err, s3Data) => {
                if (!!err)
                    reject(err);
                else {
                    s3Data.Contents.forEach((s3Object) => {
                        foundKeys.push(s3Object.Key);
                    });

                    if (s3Data.IsTruncated)
                        loadKeys(s3Data.Contents[s3Data.Contents.length - 1].Key);
                    else {
                        resolve(foundKeys);
                    }
                }
            });
        })(null);
    })
    .then((foundKeys) => {
        return new Promise((resolve, reject) => {
            let s3 = new aws.S3({ apiVersion: '2006-03-01' });

            (function removeObject() {
                if (foundKeys.length > 0) {
                    let checkKey = foundKeys.shift();

                    if (sourceKeys.indexOf(checkKey) < 0) {
                        s3.deleteObject({ Bucket: task.dest.bucket, Key: checkKey }, (err, s3Data) => {
                            if (!!err)
                                reject(err);
                            else {
                                removeObject();
                            }
                        });
                    } else
                        removeObject();
                } else
                    resolve();
            })();
        });
    });
}

module.exports.Task = s3Task;
