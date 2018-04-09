"use strict";

const aws = require(`aws-sdk`),
    fs = require(`fs-extra`),
    path = require(`path`),
    { ConfigureNPM } = require(`./npm`),
    { CleanTemporaryRoot } = require(`../../extractArchive`),
    { Dev, Trace, Debug, Info } = require(`../../logging`),
    { GetPathForArchive } = require(`../../writeToS3`);

const lambda = new aws.Lambda({ apiVersion: `2015-03-31` });
const s3 = new aws.S3({ apiVersion: `2006-03-01` });

function functionConfiguration(functionName) {
    return lambda.getFunctionConfiguration({ FunctionName: functionName }).promise()
        .then(configuration => {
            Dev({ "This Lambda function's configuration": configuration }, true);

            return configuration;
        });
}

function lambdaTask(task, remainingTasks, s3Source, localRoot) {
    if (!!task.functions && (task.functions.length > 0)) {
        return deployFunction(task, remainingTasks, s3Source, localRoot);
    } else
        return Promise.resolve();
}

function generateFunctionName(remainingTasks, shortName) {
    return `ld_${!!remainingTasks.applicationName ? `${remainingTasks.applicationName}_` : ``}${shortName}`;
}

function deployFunction(task, remainingTasks, s3Source, localRoot) {
    let nextFunction = task.functions.shift(),
        functionName = generateFunctionName(remainingTasks, nextFunction.name),
        codeLocation = path.join(localRoot, `packaging`, functionName);

    Debug({ "Lambda function deployment": nextFunction}, true);
    Info(`Deploying ${functionName}`);

    return CleanTemporaryRoot(localRoot)
        .then(() => { Debug(`Walk the code, and copy all requires`); })
        .then(() => prepareCodeFiles(codeLocation, s3Source, remainingTasks.startTime.valueOf(), [nextFunction.source]))
        .then(npmRequires => ConfigureNPM(task, localRoot, codeLocation, s3Source, remainingTasks.startTime.valueOf(), nextFunction.source, npmRequires));
}

function prepareCodeFiles(codeLocation, s3Source, startTime, filesToProcess, npmRequires, writtenPaths) {
    Dev({ filesToProcess, npmRequires, writtenPaths }, true);

    if (!npmRequires)
        npmRequires = [];
    if (!writtenPaths)
        writtenPaths = [];

    if (filesToProcess.length > 0) {
        let nextFile = filesToProcess.shift(),
            destination = path.join(codeLocation, nextFile),
            pStatus = Promise.resolve();

        // Check to see if the file has already been copied
        if (writtenPaths.indexOf(destination) >= 0)
            // Skip the file as it already exists
            Debug(`Skipping ${nextFile} as ${destination} already copied.`);
        else {
            Trace(`${destination} does not exist locally.`);

            // Load the file from S3
            let fileParams = { Bucket: s3Source.bucket.name, Key: path.normalize(`${GetPathForArchive(startTime)}/${nextFile}`) };
            Debug({ "Load from S3": fileParams }, true);
            pStatus = s3.getObject(fileParams).promise()
                .then(s3Data => {
                    let sourceFile = s3Data.Body.toString(`utf8`);

                    Dev(sourceFile);

                    // Analyze the require statements
                    let foundRequires = sourceFile.match(/require\(".+"\)/g);
                    Debug({ "Found requires": foundRequires }, true);

                    if (!!foundRequires) {
                        let forNpm = [],
                            localFiles = [];

                        foundRequires.forEach(req => {
                            let requireItem = req.match(/\("(.+)"\)/g);

                            if (RegExp.$1.substr(0, 1) == `.`)
                                localFiles.push(RegExp.$1);
                            else
                                forNpm.push(RegExp.$1);
                        });

                        Trace({ forNpm, localFiles }, true);

                        // NPM-requires go onto the NPM array
                        forNpm.forEach(req => {
                            if (npmRequires.indexOf(req) < 0)
                                npmRequires.push(req);
                        });

                        // Local files are added to the filesToProcess array
                        localFiles.forEach(req => {
                            let loadPath = path.join(path.dirname(nextFile), req);
                            if ((loadPath.search(/\.js$/) < 0) && (loadPath.search(/\.json$/) < 0))
                                loadPath += `.js`;

                            filesToProcess.push(loadPath);
                        });
                    }

                    return sourceFile;
                })
                .then(sourceFile => {
                    // Save to disk
                    Debug(`Writing S3 contents to ${destination}`);
                    return fs.ensureDir(path.dirname(destination))
                        .then(() => fs.writeFile(destination, sourceFile, { encoding: `utf8` }))
                        .then(() => {
                            writtenPaths.push(destination);
                            Trace(`${destination} written to disk`);
                        });
                });
        }

        pStatus = pStatus
            .then(() => prepareCodeFiles(codeLocation, s3Source, startTime, filesToProcess, npmRequires, writtenPaths));

        return pStatus;
    } else
        return Promise.resolve(npmRequires);
}

module.exports.FunctionConfiguration = functionConfiguration;
module.exports.LambdaTask = lambdaTask;
module.exports.GetDeployedName = generateFunctionName;
