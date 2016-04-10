"use strict";

let fs = require("fs"),
    aws = require("aws-sdk");

function s3Task(task, extractionLocation) {
    return new Promise((resolve, reject) => {
        // Read the files in the path
        readDirectory(extractionLocation + task.source, extractionLocation + task.source, task)
            .then(() => {
                resolve();
            })
            .catch((err) => {
                reject(err);
            });
    });
}

function readDirectory(path, rootPath, task) {
    return new Promise((resolve, reject) => {
        fs.readdir(path, (err, files) => {
            if (!!err)
                reject(err);
            else
                resolve(files);
        });
    })
    .then((files) => {
        return directoryContents(files, path, rootPath, task);
    });
}

function directoryContents(files, path, rootPath, task) {
    let fileHandler = [];

    files.forEach((fileName) => {
        let objectPath = path + "/" + fileName;
        let stats = fs.statSync(objectPath);

        if (stats.isFile())
            fileHandler.push(handleFile(rootPath, objectPath, task));
        else if (stats.isDirectory())
            fileHandler.push(handleDirectory(rootPath, objectPath, task));
    });

    return Promise.all(fileHandler);
}

function handleFile(rootPath, filePath, task) {
    let relativePath = filePath.replace(rootPath + "/", "");
    if (!!task.dest.key)
        relativePath = task.dest.key + "/" + relativePath;

console.log(`${filePath} is a file going to ${relativePath} in ${task.dest.bucket}`);

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

function handleDirectory(rootPath, directoryPath, task) {
console.log(`${directoryPath} is a directory`);

    return readDirectory(directoryPath, rootPath, task);
    // return null;
}

module.exports = s3Task;
