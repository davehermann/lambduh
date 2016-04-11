"use strict";

let aws = require("aws-sdk"),
    fs = require("fs"),
    admZip = require("adm-zip"),
    lambda = new aws.Lambda({ apiVersion: "2015-03-31" }),
    path = require("path"),
    mkdirp = require("mkdirp");

function lambdaTask(task, extractionLocation, localRoot, configuration) {
    return allExistingFunctions()
        .then((existingFunctions) => {
            let definitionList = [];

            task.functions.forEach((functionDefinition) => {
                definitionList.push(deployFunction(functionDefinition, existingFunctions, configuration, extractionLocation, localRoot));
            });

            return Promise.all(definitionList);

            return null;
        })
        // .catch((err) => {
        //     throw err;
        // })
        ;
}

function allExistingFunctions() {
    return new Promise((resolve, reject) => {
        lambda.listFunctions(null, (err, functionData) => {
            if (!!err)
                reject(err);
            else
                resolve(functionData);
        });
    })
    .then((fData) => {
console.log(fData);

        return fData;
    });
}

function deployFunction(functionDefinition, existingFunctions, configuration, extractionLocation, localRoot) {
    return new Promise((resolve, reject) => {
console.log(functionDefinition);
        let functionName = functionDefinition.name;
        if (!!configuration.applicationName)
            functionName = configuration.applicationName + "_" + functionName;

        let functionExists = existingFunctions.Functions.some((item) => { return item.FunctionName.toLowerCase() == functionName.toLowerCase() });

        // Copy code files, dependencies, and all node_modules to a location specific to function
        let codeLocation = `${localRoot}/packaging/${functionName}`;
console.log("Copying ", extractionLocation + functionDefinition.source, " to ", codeLocation + functionDefinition.source);

        // Create the directory
        mkdirp.sync(`${codeLocation}${path.dirname(functionDefinition.source)}`);

        // Write the file
        let fileWriter = fs.createWriteStream(codeLocation + functionDefinition.source);
        fileWriter.on("error", (err) => {
            reject(err);
        });
        fileWriter.on("finish", () => {
            // Zip the entire function directory
            // NOTE: ADM-Zip doesn't work correctly for the helper-functions addLocalFile and addLocalFolder
            //  http://stackoverflow.com/questions/33296396/adm-zip-zipping-files-as-directories
            // Use addFile manually configuring the permissions
            let zip = new admZip();
            zip.addFile(`${functionName}${functionDefinition.source}`, fs.readFileSync(codeLocation + functionDefinition.source), "", 0o644 << 16);

console.log(zip.getEntries().map((item) => {
    return `${item.isDirectory ? "Directory" : "File"}: ${item.entryName}`;
}));
//
// zip.toBuffer(
//     (buffZip) => {
//
// // Write the zip to S3
// let s3 = new aws.S3();
// s3.putObject({ Bucket: "pipeline-source.sourcerer.auction", Key: "zippedData.zip", Body: buffZip }, (err, data) => {
//     if (!!err)
//         reject(err);
//     else {

            if (!functionExists) {
                // Create the function
                let newFunction = new (function() {
                    this.FunctionName = functionName;
                    this.Runtime = "nodejs4.3";
                    this.Role = functionDefinition.iamRoleArn;
                    this.Handler = `${functionName}${path.dirname(functionDefinition.source)}/${path.basename(functionDefinition.source, path.extname(functionDefinition.source))}.lambda`;
                    this.MemorySize = !!functionDefinition.memorySize ? functionDefinition.memorySize : 128;
                    this.Timeout = !!functionDefinition.timeout ? functionDefinition.timeout : 5;
                })();
console.log("Creating Lambda Function: ", newFunction);
                newFunction.Code ={ ZipFile: zip.toBuffer() }

                lambda.createFunction(newFunction, (err, data) => {
                    if (!!err)
                        reject(err);
                    else {
console.log(data);
                        resolve();
                    }
                })
            } else {
                let codeUpdate = new (function() {
                    this.FunctionName = functionName;
                    this.ZipFile = zip.toBuffer();
                })();
                lambda.updateFunctionCode(codeUpdate, (err, data) => {
                    if (!!err)
                        reject(err)
                    else {
console.log(data);
                        let configurationUpdate = new (function() {
                            this.FunctionName = functionName;
                            this.Role = functionDefinition.iamRoleArn;
                            this.Handler = `${functionName}${path.dirname(functionDefinition.source)}/${path.basename(functionDefinition.source, path.extname(functionDefinition.source))}.lambda`;
                            this.MemorySize = !!functionDefinition.memorySize ? functionDefinition.memorySize : 128;
                            this.Timeout = !!functionDefinition.timeout ? functionDefinition.timeout : 5;
                        })();

                        lambda.updateFunctionConfiguration(configurationUpdate, (err, data) => {
                            if (!!err)
                                reject(err);
                            else {
console.log(data);
                                resolve();
                            }
                        })
                    }
                });
            }

//     }
// });
//     },
//     (err) => {
//         reject(err);
//     }
// )

        });

        fs.createReadStream(extractionLocation + functionDefinition.source).pipe(fileWriter);
    });
}

module.exports = lambdaTask;
