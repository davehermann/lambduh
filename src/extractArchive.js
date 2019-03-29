"use strict";

// Node Modules
const path = require(`path`);

// NPM Modules
const aws = require(`aws-sdk`),
    fs = require(`fs-extra`),
    jsZip = require(`jszip`),
    tar = require(`tar`);

// Application Modules
const log = require(`./logging`);

const s3 = new aws.S3({ apiVersion: `2006-03-01` });

// Clean any existing files that may exist from prior execution of this instance
function cleanTemporaryRoot(localRoot) {
    log.Trace(`Checking ${localRoot} for any prior runs of this instance with remaining data`);

    // Use fs.stat to check for the existance of the temporary directory
    return fs.stat(localRoot)
        .then(() => {
            // If the directory exists, it needs to be removed
            log.Trace(`Cleaning ${localRoot} of found data`);

            return fs.remove(localRoot);
        })
        .catch(err => {
            // If the directory does not exist, fs.stat throws and error and we can continue
            if (err.message.search(/no such file or directory/g) >= 0) {
                log.Trace(`${localRoot} does not exist`);
                return null;
            } else
                // Throw any other errors
                return Promise.reject(err);
        });
}

// Extract the archive used to start processing
function extractArchive(s3Record, extractionLocation) {
    log.Debug(`Extracting Code Archive`);

    let pExtract = fs.ensureDir(extractionLocation);

    // Support for tarballs
    if (s3Record.object.key.search(/\.tar/g) > 0) {
        log.Debug(`...tarball detected`);

        pExtract = pExtract
            .then(() => {
                return new Promise((resolve, reject) => {
                    let extractor = tar.extract({ cwd: extractionLocation })
                        .on(`error`, err => {
                            log.Error(err);
                            reject(err);
                        })
                        .on(`end`, () => {
                            log.Debug(`...extract complete`);
                            resolve();
                        });

                    s3.getObject({ Bucket: s3Record.bucket.name, Key: s3Record.object.key })
                        .createReadStream()
                        .pipe(extractor);
                });
            });
    }

    // Support for zip
    if (s3Record.object.key.search(/\.zip$/) > 0) {
        log.Debug(`...zip archive detected`);

        pExtract = pExtract
            .then(() => s3.getObject({ Bucket: s3Record.bucket.name, Key: s3Record.object.key }).promise())
            .then(data => {
                let unzip = new jsZip();
                return unzip.loadAsync(data.Body, { createFolders: true });
            })
            .then(contentsZip => writeZipContents(contentsZip, extractionLocation))
            .then(() => { log.Debug(`...extract complete`); });
    }

    return pExtract;
}

// Extract each file from the zip archive
function writeZipContents(contentsZip, extractionLocation, remainingFileNames) {
    if (!remainingFileNames) {
        remainingFileNames = Object.keys(contentsZip.files);
        log.Debug({ allFilesInZip: remainingFileNames });
    }

    if (remainingFileNames.length > 0) {
        let relativeFilePath = remainingFileNames.shift();
        log.Trace({ [`Next file`]: relativeFilePath });

        let fileInZip = contentsZip.file(relativeFilePath);
        if (!!fileInZip)
            // If the object is a file, retrieve as a buffer
            return fileInZip.async(`nodebuffer`)
                .then(fileContent => {
                    // Get the path for the object
                    let absolutePathForFile = path.join(extractionLocation, relativeFilePath);
                    log.Trace(`Writing to ${absolutePathForFile}`);

                    // Ensure the directory exists
                    return fs.ensureDir(path.dirname(absolutePathForFile))
                        // Write the file
                        .then(() => fs.writeFile(absolutePathForFile, fileContent));
                })
                .then(() => writeZipContents(contentsZip, extractionLocation, remainingFileNames));
        else
            // Skip folders
            return writeZipContents(contentsZip, extractionLocation, remainingFileNames);
    } else
        return Promise.resolve();
}

module.exports.CleanTemporaryRoot = cleanTemporaryRoot;
module.exports.ExtractArchive = extractArchive;
