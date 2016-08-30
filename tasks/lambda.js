"use strict";

let aws = require("aws-sdk"),
    fs = require("fs-extra"),
    jsZip = require("jszip"),
    lambda = new aws.Lambda({ apiVersion: "2015-03-31" }),
    path = require("path"),
    uuid = require("uuid"),
    spawn = require("child_process").spawn;

function lambdaTask(task, extractionLocation, localRoot, configuration) {
    return allExistingFunctions()
        .then((existingFunctions) => {
            return npmInstall(extractionLocation, localRoot, task)
                .then(() => {
                    return existingFunctions;
                });
        })
        .then((existingFunctions) => {
            let definitionList = [];

            task.functions.forEach((functionDefinition) => {
                definitionList.push(deployFunction(functionDefinition, existingFunctions, task, configuration, extractionLocation, localRoot));
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

function npmInstall(extractionLocation, localRoot, task) {
    return setPackageJson(extractionLocation, task)
        .then(() => {
            // Generate a .npmrc file in the extractionLocation
            return new Promise((resolve, reject) => {
                fs.readFile(`./npmrc_template`, { encoding: `utf8` }, (err, contents) => {
                    if (!!err)
                        reject(err);
                    else
                        resolve(contents);
                });
            })
                .then((npmrc) => {
                    console.log(`npmrc template:`, npmrc);
                    return npmrc
                        .replace(/\%EXTRACTIONLOCATION\%/g, extractionLocation)
                        .replace(/\%LOCALROOT\%/g, localRoot)
                        ;
                })
                .then((npmrc) => {
                    console.log(`npmrc:`, npmrc);

                    return new Promise((resolve, reject) => {
                        console.log(`Writing to ${extractionLocation}/.npmrc`);

                        fs.writeFile(`${extractionLocation}/.npmrc`, npmrc, { encoding: `utf8`, mode: 0o600 }, (err) => {
                            if (!!err)
                                reject(err);
                            else
                                resolve();
                        });
                    });
                })
                ;
        })
        .then(() => {
            return new Promise((resolve, reject) => {
                fs.mkdirsSync(`${localRoot}/npmConfig/cache`);
                fs.mkdirsSync(`${localRoot}/home`);

                console.log(`Run NPM Install in ${extractionLocation}`);

                // let npm = spawn("npm", ["install", "--production", "--prefix", extractionLocation, "--userconfig", `${localRoot}/npmConfig`, "--cache", `${localRoot}/npmConfig/cache`], { cwd: extractionLocation }),
                let npm = spawn(`env`, [`HOME=${localRoot}/home`, "npm", "install", "--production"], { cwd: extractionLocation }),
                    runDetails = "",
                    errDetails = "";

                npm.stdout.on("data", (data) => {
                    runDetails += data;
                });
                npm.stderr.on("data", (data) => {
                    errDetails += data;
                });
                npm.on("error", (err) => {
                    console.log(`ERROR:`, err);
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
                        if (errDetails.length > 0)
                            console.log("Warnings: ", errDetails);
                        console.log("Install: ", runDetails);
                        resolve();
                    }
                });
            });
        });
}

function setPackageJson(extractionLocation, task) {
    if (!task || !task.alternatePackageJson)
        return Promise.resolve();
    else
        return new Promise((resolve, reject) => {
            // Copy the alternate package.json to package.json
            fs.copy(path.normalize(`${extractionLocation}/${task.alternatePackageJson}`), path.normalize(`${extractionLocation}/package.json`), { clobber: true }, (err) => {
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

function copyNodeModules(extractionLocation, codeLocation, filePath, localRoot) {
    return new Promise((resolve, reject) => {
        // Get the files in the end path of the function
        fs.readdir(`${extractionLocation}${path.dirname(filePath)}`, (err, files) => {
            if (!!err)
                reject(err);
            else
                resolve(files);
        });
    })
    .then((files) => {
        // If a node_modules exists in the function path, use the node_modules
        if (files.indexOf(`node_modules`) >= 0) {
            return new Promise((resolve, reject) => {
                console.log(`Moving node_modules from ${path.normalize(`${extractionLocation}${path.dirname(filePath)}`)} to ${path.normalize(codeLocation)}`);

                fs.move(path.normalize(`${extractionLocation}${path.dirname(filePath)}/node_modules`), path.normalize(`${codeLocation}/node_modules`), (err) => {
                    if (!!err)
                        reject(err);
                    else
                        resolve(true);
                });
            });
        } else if (files.indexOf(`package.json`) < 0)
            return false;
        else
            // If a package.json exists in the file path, use that
            return new Promise((resolve, reject) => {
                // Copy the package.json, and NPM install it
                fs.copy(path.normalize(`${extractionLocation}${path.dirname(filePath)}/package.json`), path.normalize(`${codeLocation}/package.json`), (err) => {
                    if (!!err)
                        reject(err);
                    else
                        resolve();
                });
            })
                .then(() => {
                    // NPM Install on the codeLocation
                    return npmInstall(codeLocation, localRoot)
                        .then(() => {
                            return true;
                        });
                })
                ;
    })
    .then((modulesLoaded) => {
        if (modulesLoaded)
            return null;
        else
            return new Promise((resolve, reject) => {
                fs.stat(path.normalize(`${extractionLocation}/node_modules`), (err, stats) => {
                    if (!err) {
                        fs.copy(path.normalize(`${extractionLocation}/node_modules`), path.normalize(`${codeLocation}/node_modules`), (err) => {
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
    });
}

function addFilesToZip(directoryToScan, functionName) {
    // Zip the entire function directory
    let zip = new jsZip();

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
        let entryList = [];

        fileItems.forEach((fsObject) => {
            let fullPath = `${functionName}${fsObject.path.replace(directoryToScan, "")}`;

            if (fullPath.search(/node\_modules/gi) >= 0) {
                let pathParts = fullPath.split(`/`), current = ``, text = ``;

                while (current != `node_modules`) {
                    current = pathParts.shift();

                    text += `${current}/`;
                }
                text += `${pathParts[0]}`;

                if (entryList.indexOf(text) < 0)
                    entryList.push(text);
            } else
                entryList.push(fullPath);

            zip.file(fullPath, fs.readFileSync(`${fsObject.path}`));
        });

        console.log(`In Code Zip File:\n`, entryList);

        return zip;
    });
}

function copyRequiredFile(codeLocation, extractionLocation, filePath) {
    let destination = path.normalize(`${codeLocation}${filePath}`),
        source = path.normalize(`${extractionLocation}${filePath}`);

    return new Promise((resolve, reject) => {
        // Determine if the file exists

        fs.stat(destination, (err, stats) => {
            if (!!err || !stats) {
                console.log(`${destination} does not exist. Copying from ${source}`);

                // // Create the directory
                // fs.mkdirsSync(`${codeLocation}${path.dirname(filePath)}`);

                fs.copy(source, destination, (err) => {
                    if (!!err)
                        reject(err);
                    else
                        resolve(true);
                });
            } else {
                console.log(`Skipping ${source} as ${destination} exists`);
                resolve(false);
            }
        });
    })
    .then((newlyCopied) => {
        if (newlyCopied) {
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
        } else
            return null;
    })
    .then((loadRequires) => {
        if ((loadRequires === null) || (loadRequires.length == 0))
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

function deployFunction(functionDefinition, existingFunctions, task, configuration, extractionLocation, localRoot) {
    console.log(functionDefinition);
    let functionName = `ld_${!!configuration.applicationName ? configuration.applicationName + "_" : ""}${functionDefinition.name}`;

    let functionExists = existingFunctions.Functions.some((item) => { return item.FunctionName.toLowerCase() == functionName.toLowerCase() });

    let codeLocation = `${localRoot}/packaging/${functionName}`;

    return copyNodeModules(extractionLocation, codeLocation, functionDefinition.source, localRoot)
        .then(() => {
            return copyRequiredFile(codeLocation, extractionLocation, functionDefinition.source);
        })
        .then(() => {
            return addFilesToZip(codeLocation, functionName)
                .then((zip) => {
                    return zip
                        .generateAsync({ type: `nodebuffer` });
                })
                ;
        })
        .then((zipBuffer) => {
            return new Promise((resolve, reject) => {
                let functionConfiguration = new (function() {
                    this.FunctionName = functionName;
                    this.Role = functionDefinition.iamRoleArn;
                    this.Handler = `${functionName}${path.dirname(functionDefinition.source)}/${path.basename(functionDefinition.source, path.extname(functionDefinition.source))}.lambda`;
                    this.MemorySize = !!functionDefinition.memorySize ? functionDefinition.memorySize : (!!task.default && !!task.default.memorySize ? task.default.memorySize : 128);
                    this.Timeout = !!functionDefinition.timeout ? functionDefinition.timeout : (!!task.default && !!task.default.timeout ? task.default.timeout : 5);
                })();

                if (!functionExists) {
                    functionConfiguration.Runtime = "nodejs4.3";
                    console.log("Creating Lambda Function: ", functionConfiguration);
                    functionConfiguration.Code = { ZipFile: zipBuffer };

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
                                this.ZipFile = zipBuffer;
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

function getAllFunctionVersions(functionArn) {
    return new Promise((resolve, reject) => {
        lambda.listVersionsByFunction({ FunctionName: functionArn }, (err, data) => {
            if (!!err) {
                console.log("Function Version Listing Error: ", err);
                reject(err);
            } else {
                console.log("All Versions of ", functionArn, ": ", data);
                resolve(data);
            }
        });
    });
}

function deleteVersion(versionArn, versionNumber) {
    return new Promise((resolve, reject) => {
        console.log("Function ", versionArn, " removing version: ", versionNumber);
        lambda.deleteFunction({ FunctionName: versionArn, Qualifier: versionNumber }, (err, data) => {
            if (!!err) {
                console.log("Version removal error: ", err);
                reject(err);
            } else {
                console.log(`Version ${versionNumber} removed: `, data);
                resolve(data);
            }
        });
    })
}

function removeUnusedVersions(functionArn) {
    return getAllFunctionVersions(functionArn)
        .then((allVersions) => {
            return getAliases(functionArn)
                .then((allAliases) => {
                    return { versions: allVersions, aliases: allAliases };
                });
        })
        .then((removalConfiguration) => {
            let versionsWithAlias = ["$LATEST"];
            if (!!removalConfiguration.aliases && !!removalConfiguration.aliases.Aliases)
                removalConfiguration.aliases.Aliases.forEach((alias) => {
                    versionsWithAlias.push(alias.FunctionVersion);
                });

            let versionDelete = [];
            removalConfiguration.versions.Versions.forEach((version) => {
                if (versionsWithAlias.indexOf(version.Version) < 0)
                    versionDelete.push(deleteVersion(version.FunctionArn, version.Version))
            });

            return Promise.all(versionDelete);
        })
        ;
}

module.exports.Task = lambdaTask;
module.exports.AllFunctions = allExistingFunctions;
module.exports.FunctionConfiguration = functionConfiguration;
module.exports.AddEventPermission = addEventInvocationPermission;
module.exports.CreateFunctionVersion = createVersion;
module.exports.GetAliases = getAliases;
module.exports.ModifyAlias = createOrUpdateAlias;
module.exports.DeleteEmptyVersions = removeUnusedVersions;
