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
            return deploySequentially(task.functions.filter(() => { return true; }), existingFunctions, task, configuration, extractionLocation, localRoot);
        })
        .catch((err) => {
            global.log.Error("Function deployment error");
            global.log.Error(err);

            throw err;
        })
        ;
}

function deploySequentially(functionList, existingFunctions, task, configuration, extractionLocation, localRoot) {
    if (functionList.length > 0) {
        let functionDefinition = functionList.shift();

        return deployFunction(functionDefinition, existingFunctions, task, configuration, extractionLocation, localRoot)
            .then(() => {
                return deploySequentially(functionList, existingFunctions, task, configuration, extractionLocation, localRoot);
            })
            ;
    } else
        return Promise.resolve();
}

function allExistingFunctions() {
    global.log.Info(`Loading list of existing Lambda functions`);

    return listLambdaFunctions(null)
        .then((fData) => {
            global.log.Debug(JSON.stringify(fData));

            return fData;
        });
}

function listLambdaFunctions(priorResults) {
    if (!priorResults || (!!priorResults && !!priorResults.NextMarker)) {
        return new Promise((resolve, reject) => {
            let searchParams = null;

            if (!!priorResults && !!priorResults.NextMarker)
                searchParams = { Marker: priorResults.NextMarker };

            lambda.listFunctions(searchParams, (err, functionData) => {
                if (!!err)
                    reject(err);
                else
                    resolve(functionData);
            });
        })
            .then((fData) => {
                // Combine the current list with the prior results
                if (!!priorResults)
                    fData.Functions = fData.Functions.concat(priorResults.Functions);

                return listLambdaFunctions(fData)
            });
    } else
        return Promise.resolve(priorResults);
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
                    global.log.Debug(`npmrc template:`, npmrc);
                    return npmrc
                        .replace(/\%EXTRACTIONLOCATION\%/g, extractionLocation)
                        .replace(/\%LOCALROOT\%/g, localRoot)
                        ;
                })
                .then((npmrc) => {
                    global.log.Debug(`npmrc:`, npmrc);

                    return new Promise((resolve, reject) => {
                        global.log.Debug(`Writing to ${extractionLocation}/.npmrc`);

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

                global.log.Info(`Run NPM Install in ${extractionLocation}`);

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
                    global.log.Error(`ERROR:`, err);
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
                            global.log.Warn("Warnings: ", errDetails);
                        global.log.Debug("Install: ", runDetails);
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
                    global.log.Error(`Error copying alternative package.json`);
                    global.log.Error(err);
                    reject(err);
                } else {
                    global.log.Info(`Replaced /package.json with /${task.alternatePackageJson}`);
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
                global.log.Debug(`Moving node_modules from ${path.normalize(`${extractionLocation}${path.dirname(filePath)}`)} to ${path.normalize(codeLocation)}`);

                fs.move(path.normalize(`${extractionLocation}${path.dirname(filePath)}/node_modules`), path.normalize(`${codeLocation}/node_modules`), (err) => {
                    if (!!err)
                        reject(err);
                    else
                        resolve(true);
                });
            });
        } else if (files.indexOf(`package.json`) < 0)
            return Promise.resolve(false);
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
                            return Promise.resolve(true);
                        });
                })
                ;
    })
    .then((modulesLoaded) => {
        if (modulesLoaded)
            return Promise.resolve(null);
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
    global.log.Info(`Generate Zip of Lambda function`);

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

        global.log.Trace(`In Code Zip File:\n`, entryList);

        return zip;
    });
}

function copyRequiredFile(codeLocation, extractionLocation, remainingFiles) {
    if (remainingFiles.length > 0) {
        let filePath = remainingFiles.shift();

        let destination = path.normalize(`${codeLocation}${filePath}`),
            source = path.normalize(`${extractionLocation}${filePath}`);

        return new Promise((resolve, reject) => {
            // Determine if the file exists

            fs.stat(destination, (err, stats) => {
                if (!!err || !stats) {
                    global.log.Trace(`${destination} does not exist. Copying from ${source}`);

                    // // Create the directory
                    // fs.mkdirsSync(`${codeLocation}${path.dirname(filePath)}`);

                    fs.copy(source, destination, (err) => {
                        if (!!err)
                            reject(err);
                        else
                            resolve(true);
                    });
                } else {
                    global.log.Trace(`Skipping ${source} as ${destination} exists`);
                    resolve(false);
                }
            });
        })
            .then((newlyCopied) => {
                if (newlyCopied) {
                    // Read the source file, and extract any requires
                    let sourceFile = fs.readFileSync(`${codeLocation}${filePath}`, "utf8");

                    let foundRequires = sourceFile.match(/require\(\".+\"\)/g);
                    global.log.Debug("Requires: ", foundRequires);
                    let loadRequires = [];

                    if (!!foundRequires)
                        foundRequires.forEach((req) => {
                            let requireItem = req.match(/\(\"(.+)\"\)/g);
                            if (RegExp.$1.substr(0, 1) == ".")
                                loadRequires.push(RegExp.$1);
                        });
                    global.log.Trace("Load: ", loadRequires);

                    return loadRequires;
                } else
                    return null;
            })
            .then((loadRequires) => {
                if ((loadRequires === null) || (loadRequires.length == 0))
                    return null;
                else {
                    let requiredFiles = [];

                    loadRequires.forEach((req) => {
                        let loadFile = `${path.dirname(filePath)}/${req}`;
                        if (loadFile.search(/\.json$/) < 0)
                            loadFile += ".js";

                        requiredFiles.push(loadFile);
                    });

                    remainingFiles = remainingFiles.concat(requiredFiles);
                    return null;
                }
            })
            .then(() => {
                return copyRequiredFile(codeLocation, extractionLocation, remainingFiles);
            })
            ;
    } else
        return Promise.resolve();
}

function deployFunction(functionDefinition, existingFunctions, task, configuration, extractionLocation, localRoot) {
    global.log.Info(`Deploying "${functionDefinition.name}" from "${functionDefinition.source}"`);
    global.log.Trace(functionDefinition);

    let functionName = `ld_${!!configuration.applicationName ? configuration.applicationName + "_" : ""}${functionDefinition.name}`;

    let functionExists = existingFunctions.Functions.some((item) => { return item.FunctionName.toLowerCase() == functionName.toLowerCase() });

    let codeLocation = `${localRoot}/packaging/${functionName}`;

    return copyNodeModules(extractionLocation, codeLocation, functionDefinition.source, localRoot)
        .then(() => {
            global.log.Debug(`Walk/Copy requires`);
            return copyRequiredFile(codeLocation, extractionLocation, [functionDefinition.source]);
        })
        .then(() => {
            return addFilesToZip(codeLocation, functionName)
                .then((zip) => {
                    let zipOptions = new (function() {
                        this.type = `nodebuffer`;

                        if (!!task.compressionLevel && (task.compressionLevel > 0)) {
                            this.compression = `DEFLATE`;
                            this.compressionOptions = { level: task.compressionLevel };
                        }
                    })();

                    return zip
                        .generateAsync(zipOptions);
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
                    this.Runtime = !!functionDefinition.runtime ? functionDefinition.runtime : (!!task.default && !!task.default.runtime ? task.default.runtime : "nodejs4.3");
                })();

                if (!functionExists) {
                    global.log.Info("Creating Lambda Function: ", functionConfiguration);
                    functionConfiguration.Code = { ZipFile: zipBuffer };

                    lambda.createFunction(functionConfiguration, (err, data) => {
                        if (!!err)
                            reject(err);
                        else {
                            global.log.Debug("Function Created: ", data);
                            resolve();
                        }
                    });
                } else {
                    // New Error thrown on update ({"errorMessage": "SubnetIds and SecurityIds must coexist or be both empty list.","errorType": "InvalidParameterValueException"})
                    // Adding empty VPC configuration to mitigate
                    functionConfiguration.VpcConfig = {
                        SubnetIds: [],
                        SecurityGroupIds: []
                    }

                    global.log.Info(`Updating Existing Lambda Function Configuration`);
                    global.log.Debug(functionConfiguration);
                    lambda.updateFunctionConfiguration(functionConfiguration, (err, data) => {
                        if (!!err) {
                            global.log.Error("Configuration Update Error: ", err);
                            reject(err);
                        } else {
                            global.log.Debug("Function Configuration Updated: ", data);

                            let codeUpdate = new (function() {
                                this.FunctionName = functionName;
                                this.ZipFile = zipBuffer;
                            })();
                            global.log.Info("Pushing Updated Code");
                            lambda.updateFunctionCode(codeUpdate, (err, data) => {
                                if (!!err)
                                    reject(err);
                                else {
                                    global.log.Debug("Function Code Updated: ", data);
                                    resolve();
                                }
                            });
                        }
                    });
                }
            });
        })
        .then(() => {
            // Clean up the function directory
            global.log.Debug(`Clear files from: `, codeLocation);
            return new Promise((resolve, reject) => {
                fs.remove(codeLocation, (err) => {
                    if (!!err)
                        reject(err);
                    else
                        resolve();
                });
            });
        })
        ;
}

function functionConfiguration(functionName) {
    return new Promise((resolve, reject) => {
        lambda.getFunctionConfiguration({ FunctionName: functionName }, (err, data) => {
            if (!!err)
                reject(err);
            else {
                global.log.Trace("Function Configuration: ", data);
                resolve(data);
            }
        });
    });
}

function removePermissions(permissionList) {
    if (permissionList.length > 0) {
        let permissionToDrop = permissionList.shift();

        return new Promise((resolve, reject) => {
            lambda.removePermission({ FunctionName: permissionToDrop.Resource, StatementId: permissionToDrop.Sid }, (err, data) => {
                if (!!err) {
                    global.log.Error(`Error dropping`, permissionToDrop.Sid, `: `, err);
                    reject(err);
                } else {
                    global.log.Debug(`Dropped ${permissionToDrop.Sid}`);
                    resolve();
                }
            });
        })
            .then(() => {
                return removePermissions(permissionList);
            })
            ;
    } else
        return Promise.resolve();
}

function clearPermissions(newPermission) {
    return new Promise((resolve, reject) => {
        let findPolicy = new (function() {
            this.FunctionName = newPermission.FunctionName;
            if (!!newPermission.Qualifier)
                this.Qualifier = newPermission.Qualifier;
        })();
        lambda.getPolicy(findPolicy, (err, data) => {
            if (!!err) {
                // In the case of no policy previously existing, continue without attempting deletion
                if (err.code == `ResourceNotFoundException`) {
                    global.log.Error(`Skipping removal of existing permissions as no policy object exists`);
                    resolve(null);
                } else {
                    global.log.Error(err);
                    reject(err);
                }
            } else {
                global.log.Debug(`Existing Policies Found -- Will be removed before adding new permissions`);
                global.log.Trace(data);
                resolve(data);
            }
        });
    })
        .then((existingPolicy) => {
            if (!!existingPolicy) {
                // Find any policy statements that have the same FunctionName, Principal and SourceArn
                let attachedPolicies = JSON.parse(existingPolicy.Policy).Statement,
                    matchingPolicies = [];
                global.log.Debug(`${attachedPolicies.length} attached to policy`);

                attachedPolicies.forEach((policy) => {
                    if (
                        (policy.Resource == newPermission.FunctionName)
                        && (policy.Principal.Service == newPermission.Principal)
                        && (policy.Condition.ArnLike[`AWS:SourceArn`] == newPermission.SourceArn)
                    )
                        matchingPolicies.push(policy);
                });
                global.log.Debug(`${matchingPolicies.length} matching will be removed`);

                return matchingPolicies;
            } else
                return [];
        })
        .then((matchingPolicies) => {
            // Remove each matching policy
            return removePermissions(matchingPolicies);
        })
        ;
}

function addEventInvocationPermission(functionArn, sourceArn, sourcePrincipal) {
    let newPermission = new (function() {
        this.FunctionName = functionArn;
        this.StatementId = uuid.v4();
        this.Action = "lambda:InvokeFunction";
        this.Principal = sourcePrincipal;
        this.SourceArn = sourceArn;
    })();
    global.log.Debug(`Adding Invoke permission for the Lambda function`);
    global.log.Trace(newPermission);

    return clearPermissions(newPermission)
        .then(() => {
            return new Promise((resolve, reject) => {
                lambda.addPermission(newPermission, (err, data) => {
                    if (!!err) {
                        global.log.Error(err);
                        reject(err);
                    } else {
                        global.log.Debug(`Lambda Permission Added`);
                        global.log.Trace(data);
                        resolve(data);
                    }
                });
            });
        })
        ;
}

function createVersion(functionArn) {
    global.log.Info(`Tag new function version for ${functionArn}`);

    return new Promise((resolve, reject) => {
        lambda.publishVersion({ FunctionName: functionArn }, (err, data) => {
            if (!!err) {
                global.log.Error(`Function Versioning Error`, err);
                reject(err);
            } else {
                global.log.Debug(`Function Version Created`);
                global.log.Trace(data);

                resolve(data);
            }
        });
    });
}

function getAliases(functionArn) {
    return new Promise((resolve, reject) => {
        lambda.listAliases({ FunctionName: functionArn }, (err, data) => {
            if (!!err) {
                global.log.Error(`Function Aliases Error`, err);
                reject(err);
            } else {
                global.log.Trace(`Found Aliases for ${functionArn}`, JSON.stringify(data));
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
                global.log.Error(`Lambda Alias Error`, err);
                reject(err);
            } else {
                global.log.Debug(`Alias ${isUpdate ? "Updated" : "Created"}: `);
                global.log.Trace(data);
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
                global.log.Error(`Function Version Listing Error`, err);
                reject(err);
            } else {
                global.log.Debug("All Versions of ", functionArn, ": ");
                global.log.Trace(data);
                resolve(data);
            }
        });
    });
}

function deleteVersion(versionArn, versionNumber) {
    return new Promise((resolve, reject) => {
        global.log.Info(`Removing version #${versionNumber} from function "${versionArn}"`);
        lambda.deleteFunction({ FunctionName: versionArn, Qualifier: versionNumber }, (err, data) => {
            if (!!err) {
                global.log.Error(`Version removal error [${versionNumber} from "${versionArn}"]`, err);
                reject(err);
            } else {
                global.log.Debug(`Version ${versionNumber} removed`);
                global.log.Trace(data);
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
