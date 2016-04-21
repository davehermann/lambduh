"use strict";

let aws = require("aws-sdk"),
    fs = require("fs-extra"),
    admZip = require("adm-zip"),
    lambda = new aws.Lambda({ apiVersion: "2015-03-31" }),
    path = require("path"),
    uuid = require("uuid"),
    spawn = require("child_process").spawn;

function lambdaTask(task, extractionLocation, localRoot, configuration) {
    return allExistingFunctions()
        .then((existingFunctions) => {
            return npmInstall(extractionLocation, localRoot, task, configuration)
                .then(() => {
                    return existingFunctions;
                });
        })
        .then((existingFunctions) => {
            let definitionList = [];

            task.functions.forEach((functionDefinition) => {
                definitionList.push(deployFunction(functionDefinition, existingFunctions, configuration, extractionLocation, localRoot));
            });

            return Promise.all(definitionList);
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

function npmInstall(extractionLocation, localRoot, task, configuration) {
    return setPackageJson(extractionLocation, task)
        .then(() => {
            return new Promise((resolve, reject) => {
                fs.mkdirsSync(`${localRoot}/npmConfig/cache`);

                let npm = spawn("npm", ["install", "--production", "--prefix", extractionLocation, "--userconfig", `${localRoot}/npmConfig`, "--cache", `${localRoot}/npmConfig/cache`], { cwd: extractionLocation }),
                    runDetails = "",
                    errDetails = "";

                npm.stdout.on("data", (data) => {
                    runDetails += data;
                });
                npm.stderr.on("data", (data) => {
                    errDetails += data;
                });
                npm.on("error", (err) => {
                    reject(err);
                });
                npm.on("close", (exitCode) => {
                    let newFiles = fs.readdirSync(extractionLocation);

                    if (newFiles.indexOf("npm-debug.log") >= 0) {
                        let debugLog = null;

                        errDetails += `\nCurrent Directory: \n${newFiles}`;

                        debugLog = fs.readFileSync(extractionLocation + "/npm-debug.log", { encoding: "utf8" });

                        if (!!debugLog) {
                            errDetails += `\n\n----------------npm-debug.log----------------\n\n`;
                            errDetails += debugLog;
                        }

                        reject(errDetails);
                    } else {
                        console.log("Warnings: ", errDetails);
                        console.log("Install: ", runDetails);
                        resolve();
                    }
                });
            });
        });
}

function setPackageJson(extractionLocation, task) {
    if (!task.alternatePackageJson)
        return null;
    else
        return new Promise((resolve, reject) => {
            // Copy the alternate package.json to package.json
            fs.copy(`${extractionLocation}/${task.alternatePackageJson}`, `${extractionLocation}/package.json`, { clobber: true }, (err) => {
                if (!!err) {
                    console.log(err);
                    reject(err);
                } else {
                    console.log(`Replaced /package.json with /${task.alternatePackageJson}`)
                    resolve();
                }
            });
        });
}

function copyNodeModules(extractionLocation, codeLocation) {
    return new Promise((resolve, reject) => {
        fs.stat(`${extractionLocation}/node_modules`, (err, stats) => {
            if (!err) {
                fs.copy(`${extractionLocation}/node_modules`, `${codeLocation}/node_modules`, (err) => {
                    if (!!err)
                        reject(err);
                    else
                        resolve();
                });
            } else if (!!err && (err.message.search(/no such file or directory/g) >= 0)) {
                resolve();
            } else
                reject(err);
        });
    });
}

function addFilesToZip(directoryToScan, functionName) {
    // Zip the entire function directory
    // NOTE: ADM-Zip doesn't work correctly for the helper-functions addLocalFile and addLocalFolder
    //  http://stackoverflow.com/questions/33296396/adm-zip-zipping-files-as-directories
    // Use addFile manually configuring the permissions
    let zip = new admZip();

    return new Promise((resolve, reject) => {
        let fileItems = [];
        fs.walk(directoryToScan)
            .on("data", (fsObject) => {
                if (fsObject.stats.isFile())
                    fileItems.push(fsObject);
            })
            .on("end", () => {
                resolve(fileItems);
            });
    })
    .then((fileItems) => {
        fileItems.forEach((fsObject) => {
            zip.addFile(`${functionName}${fsObject.path.replace(directoryToScan, "")}`, fs.readFileSync(`${fsObject.path}`), "", 0o644 << 16);
        });

        return zip;
    });
}

function copyRequiredFile(codeLocation, extractionLocation, filePath) {
    return new Promise((resolve, reject) => {
    console.log("Copying ", `${extractionLocation}${filePath}`, " to ", `${codeLocation}${filePath}`);

        // // Create the directory
        // fs.mkdirsSync(`${codeLocation}${path.dirname(filePath)}`);

        fs.copy(`${extractionLocation}${filePath}`, `${codeLocation}${filePath}`, (err) => {
            if (!!err)
                reject(err);
            else
                resolve();
        });
    })
    .then(() => {
        // Read the source file, and extract any requires
        let sourceFile = fs.readFileSync(`${codeLocation}${filePath}`, "utf8");

        let foundRequires = sourceFile.match(/require\(\".+\"\)/g);
        console.log("Requires: ", foundRequires);
        let loadRequires = [];

        if (!!foundRequires)
            foundRequires.forEach((req) => {
                let requireItem = req.match(/\(\"(.+)\"\)/g);
                if (RegExp.$1.substr(0, 1) == ".")
                    loadRequires.push(RegExp.$1);
            });
        console.log("Load: ", loadRequires);

        return loadRequires;
    })
    .then((loadRequires) => {
        if (loadRequires.length == 0)
            return null;
        else {
            let pRequires = [];
            loadRequires.forEach((req) => {
                let loadFile = `${path.dirname(filePath)}/${req}`;
                if (loadFile.search(/\.json$/) < 0)
                    loadFile += ".js";

                pRequires.push(copyRequiredFile(codeLocation, extractionLocation, loadFile));
            });

            return Promise.all(pRequires);
        }
    })
    ;
}

function deployFunction(functionDefinition, existingFunctions, configuration, extractionLocation, localRoot) {
    console.log(functionDefinition);
    let functionName = `ld_${!!configuration.applicationName ? configuration.applicationName + "_" : ""}${functionDefinition.name}`;

    let functionExists = existingFunctions.Functions.some((item) => { return item.FunctionName.toLowerCase() == functionName.toLowerCase() });

    let codeLocation = `${localRoot}/packaging/${functionName}`;

    return copyNodeModules(extractionLocation, codeLocation)
        .then(() => {
            return copyRequiredFile(codeLocation, extractionLocation, functionDefinition.source);
            // return new Promise((resolve, reject) => {
            // console.log("Copying ", extractionLocation + functionDefinition.source, " to ", codeLocation + functionDefinition.source);

                // // Create the directory
                // fs.mkdirsSync(`${codeLocation}${path.dirname(functionDefinition.source)}`);

                // fs.copy(`${extractionLocation}${functionDefinition.source}`, `${codeLocation}${functionDefinition.source}`, (err) => {
                //     if (!!err)
                //         reject(err)
                //     else {
                //         resolve();
                //     }
                // });
            // });
        })
        .then(() => {
            return addFilesToZip(codeLocation, functionName)
                .then((zip) => {
                    let displayedNodeModules = 0;
                    console.log("In Code Zip File: ", zip.getEntries().map((item) => {
                        if (item.entryName.search(/node\_modules/gi) >= 0) {
                            if (displayedNodeModules < 10) {
                                displayedNodeModules++;
                                return `Directory: node_modules with ${item.entryName}`;
                            } else {
                                return null;
                            }
                        } else
                            return `${item.isDirectory ? "Directory" : "File"}: ${item.entryName}`;
                    }).filter((item) => { return item !== null; }));

                    return zip;
                });
        })
        .then((zip) => {
            return new Promise((resolve, reject) => {
                let functionConfiguration = new (function() {
                    this.FunctionName = functionName;
                    this.Role = functionDefinition.iamRoleArn;
                    this.Handler = `${functionName}${path.dirname(functionDefinition.source)}/${path.basename(functionDefinition.source, path.extname(functionDefinition.source))}.lambda`;
                    this.MemorySize = !!functionDefinition.memorySize ? functionDefinition.memorySize : 128;
                    this.Timeout = !!functionDefinition.timeout ? functionDefinition.timeout : 5;
                })();

                if (!functionExists) {
                    functionConfiguration.Runtime = "nodejs4.3";
                    console.log("Creating Lambda Function: ", functionConfiguration);
                    functionConfiguration.Code = { ZipFile: zip.toBuffer() };

                    lambda.createFunction(functionConfiguration, (err, data) => {
                        if (!!err)
                            reject(err);
                        else {
                            console.log("Function Created: ", data);
                            resolve();
                        }
                    });
                } else {
                    console.log("Update Lambda Function: ", functionConfiguration);
                    lambda.updateFunctionConfiguration(functionConfiguration, (err, data) => {
                        if (!!err) {
                            console.log("Configuration Update Error: ", err);
                            reject(err);
                        } else {
                            console.log("Function Configuration Updated: ", data);

                            let codeUpdate = new (function() {
                                this.FunctionName = functionName;
                                this.ZipFile = zip.toBuffer();
                            })();
                            console.log("Updating code");
                            lambda.updateFunctionCode(codeUpdate, (err, data) => {
                                if (!!err)
                                    reject(err);
                                else {
                                    console.log("Function Code Updated: ", data);
                                    resolve();
                                }
                            });
                        }
                    });
                }
            });
        });
}

function functionConfiguration(functionName) {
    return new Promise((resolve, reject) => {
        lambda.getFunctionConfiguration({ FunctionName: functionName }, (err, data) => {
            if (!!err)
                reject(err);
            else {
                console.log("Configuration: ", data);
                resolve(data);
            }
        });
    });
}

function addEventInvocationPermission(functionArn, sourceArn, sourcePrincipal) {
    return new Promise((resolve, reject) => {
        let newPermission = new (function() {
            this.FunctionName = functionArn;
            this.StatementId = uuid.v4();
            this.Action = "lambda:InvokeFunction";
            this.Principal = sourcePrincipal;
            this.SourceArn = sourceArn;
        })();
        console.log("Add Lambda Permission: ", newPermission);
        lambda.addPermission(newPermission, (err, data) => {
            if (!!err) {
                console.log(err);
                reject(err);
            } else {
                console.log("Lambda Permission Added: ", data);
                resolve(data);
            }
        });
    });
}

function createVersion(functionArn) {
    return new Promise((resolve, reject) => {
        lambda.publishVersion({ FunctionName: functionArn }, (err, data) => {
            if (!!err) {
                console.log("Function Versioning Error: ", err);
                reject(err);
            } else {
                console.log("Function Version Created: ", data);
                resolve(data);
            }
        });
    });
}

function getAliases(functionArn) {
    return new Promise((resolve, reject) => {
        lambda.listAliases({ FunctionName: functionArn }, (err, data) => {
            if (!!err) {
                console.log("Function Aliases Error: ", err);
                reject(err);
            } else {
                console.log(`Found Aliases for ${functionArn}`, data);
                resolve(data);
            }
        });
    });
}

function createOrUpdateAlias(functionVersionDetail, aliasName, isUpdate) {
    return new Promise((resolve, reject) => {
        let alias = new (function() {
            this.FunctionName = functionVersionDetail.FunctionName;
            this.FunctionVersion = functionVersionDetail.Version;
            this.Name = aliasName;
        })();

        let fUpd = function(err, data) {
            if (!!err) {
                console.log("Lambda Alias Error: ", err);
                reject(err);
            } else {
                console.log(`Alias ${isUpdate ? "Updated" : "Created"}: `, data);
                resolve(data);
            }
        }

        if (isUpdate)
            lambda.updateAlias(alias, (err, data) => {
                fUpd(err, data);
            });
        else
            lambda.createAlias(alias, (err, data) => {
                fUpd(err, data);
            });
    });
}

module.exports.Task = lambdaTask;
module.exports.AllFunctions = allExistingFunctions;
module.exports.FunctionConfiguration = functionConfiguration;
module.exports.AddEventPermission = addEventInvocationPermission;
module.exports.CreateFunctionVersion = createVersion;
module.exports.GetAliases = getAliases;
module.exports.ModifyAlias = createOrUpdateAlias;
