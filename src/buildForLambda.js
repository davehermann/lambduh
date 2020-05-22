"use strict";

/* eslint-disable no-console */

// Node Modules
const fs = require(`fs`),
    path = require(`path`);

// NPM Modules
const jsZip = require(`jszip`);

// Application Modules
const { ReadDirectoryContents } = require(`./scanDirectory`);

let useDirectory = path.normalize(__dirname),
    zipOutput = `../Lambda Deployment Package.zip`;

function createLambdaPackage() {
    return ReadDirectoryContents(useDirectory)
        .then(filesFound => {
            // Filter the files for what we need
            // *.js and npmrc_template in the root
            // All ./node_modules and ./tasks files

            console.log(`${filesFound.length} files located in ${useDirectory}`);

            let filesToZip = filesFound
                .map(filePath => { return filePath.replace(`${useDirectory}${path.sep}`, ``); })
                .filter(filePath => {
                    let includeFile = false;

                    // Include all Javascript files in the application root, except for this file
                    if ((filePath.indexOf(path.sep) < 0) && (path.extname(filePath) == `.js`) && (filePath !== `buildForLambda.js`))
                        includeFile = true;

                    // Include the npmrc_template file
                    if ((filePath == `npmrc_template`))
                        includeFile = true;

                    // Include all files under ./tasks/
                    if (filePath.search(/^tasks/) == 0)
                        includeFile = true;

                    // Include all files under ./node_modules/
                    if (filePath.search(/^node_modules/) == 0)
                        includeFile = true;

                    // Include the Readme file
                    if (filePath == `Readme.md`)
                        includeFile = true;

                    return includeFile;
                });

            console.log(`${filesToZip.length} files to be compressed`);

            // Create the zip
            let zip = new jsZip();

            filesToZip.forEach(fileName => {
                let fullPath = path.join(useDirectory, fileName);

                zip.file(fileName, fs.readFileSync(fullPath));
            });

            let zipOptions = {
                type: `nodebuffer`,
                compression: `DEFLATE`,
                compressionOptions: { level: 7 }
            };

            return zip.generateAsync(zipOptions);
        })
        .then(zippedBuffer => fs.promises.writeFile(path.join(useDirectory, zipOutput), zippedBuffer))
        .then(() => { console.log(`Compression completed to "${zipOutput}"`); });
}

console.log(`Running in ${useDirectory}`);
createLambdaPackage();
