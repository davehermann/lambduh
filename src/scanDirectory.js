"use strict";

const fs = require(`fs-extra`),
    path = require(`path`);

function getAllFilePathsInDirectory(searchPath) {
    return fs.readdir(searchPath)
        .then(directoryObjects => directoryContents(searchPath, directoryObjects));
}

function directoryContents(searchPath, directoryObjects, foundFiles) {
    if (!foundFiles)
        foundFiles = [];

    if (directoryObjects.length > 0) {
        let fsObjectName = directoryObjects.shift();

        let objectPath = path.join(searchPath, fsObjectName);
        return fs.stat(objectPath)
            .then(stats => {
                let pHandler = Promise.resolve();

                if (stats.isFile())
                    foundFiles.push(objectPath);
                else if (stats.isDirectory())
                    pHandler = getAllFilePathsInDirectory(objectPath)
                        .then(subDirectoryFiles => {
                            foundFiles = foundFiles.concat(subDirectoryFiles);
                        });

                return pHandler;
            })
            .then(() => directoryContents(searchPath, directoryObjects, foundFiles));
    } else
        return Promise.resolve(foundFiles);
}

module.exports.ReadDirectoryContents = getAllFilePathsInDirectory;
