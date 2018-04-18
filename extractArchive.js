"use strict";

const aws = require(`aws-sdk`),
    fs = require(`fs-extra`),
    tar = require(`tar`),
    log = require(`./logging`);

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
    log.Trace(`Extracting Code Archive`);

    let pExtract = fs.ensureDir(extractionLocation);

    // Support for tarballs
    if (s3Record.object.key.search(/\.tar/g) >= 0) {
        pExtract = pExtract
            .then(() => {
                return new Promise((resolve, reject) => {
                    let extractor = tar.extract({ cwd: extractionLocation })
                        .on(`error`, err => {
                            log.Error(err);
                            reject(err);
                        })
                        .on(`end`, () => {
                            log.Trace(`...extract complete`);
                            resolve();
                        });

                    s3.getObject({ Bucket: s3Record.bucket.name, Key: s3Record.object.key })
                        .createReadStream()
                        .pipe(extractor);
                });
            });
    }

    return pExtract;
}

module.exports.CleanTemporaryRoot = cleanTemporaryRoot;
module.exports.ExtractArchive = extractArchive;
