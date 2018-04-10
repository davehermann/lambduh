"use strict";

const fs = require(`fs-extra`),
    jsZip = require(`jszip`),
    { ReadDirectoryContents } = require(`../../extractArchive`),
    { Dev, Trace, Debug, Info } = require(`../../logging`);

function generateZip(codeLocation, functionName, task) {
    return addFilesToZip(codeLocation, functionName)
        .then(zip => {
            let zipOptions = {
                type: `nodebuffer`
            };

            if (!!task.compressionLevel && (task.compressionLevel > 0)) {
                zipOptions.compression = `DEFLATE`;
                zipOptions.compressionOptions = { level: task.compressionLevel };
            }

            Debug(`Generate the zip as a Buffer`);
            return zip.generateAsync(zipOptions);
        });
}

// Zip the entire function directory
function addFilesToZip(codeLocation, functionName) {
    Info(`Create a zip of the function's files`);

    // Find all file paths in the function directory
    return ReadDirectoryContents(codeLocation)
        .then(foundFiles => {
            Trace({ "function files": foundFiles }, true);

            let zip = new jsZip();

            foundFiles.forEach(filePath => {
                let fullPath = `${functionName}${filePath.replace(codeLocation, ``)}`;

                zip.file(fullPath, fs.readFileSync(filePath));
            });

            return zip;
        });
}

module.exports.GenerateZip = generateZip;
