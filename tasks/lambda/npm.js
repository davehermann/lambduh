"use strict";

const aws = require(`aws-sdk`),
    fs = require(`fs-extra`),
    path = require(`path`),
    spawn = require(`child_process`).spawn,
    { Dev, Trace, Debug, Info, Warn, Fatal } = require(`../../logging`),
    { GetPathForArchive, ListFilesInBucket } = require(`../../writeToS3`);

const s3 = new aws.S3({ apiVersion: `2006-03-01` });

function configureNpm(task, localRoot, codeLocation, s3Source, startTime, functionMain, npmRequires) {
    // Check the function's S3 location for an npm_modules directory, and simply use that if it exists
    // Even if we haven't detected NPM modules, always include a function-specific node_modules directory
    return ListFilesInBucket(s3Source.bucket.name, `${GetPathForArchive(startTime)}/${path.dirname(functionMain)}/node_modules/`)
        .then(foundFiles => {
            if (foundFiles.length > 0) {
                // Get every object, and write to disk
                return Promise.resolve();
            } else {
                // Run NPM in the file system
                return npmInstall(task, s3Source, localRoot, codeLocation, startTime, npmRequires);
            }
        });
}

function npmInstall(task, s3Source, localRoot, codeLocation, startTime, npmRequires) {
    return setPackageJSON(task, s3Source, codeLocation, startTime)
        .then(packageJSON => {
            // If the AWS SDK is required, and it appears in the package JSON's dependencies, install it
            // Otherwise, remove it from the list
            if ((npmRequires.indexOf(`aws-sdk`) >= 0) && (!packageJSON.dependencies || !packageJSON.dependencies[`aws-sdk`]))
                npmRequires.splice(npmRequires.indexOf(`aws-sdk`), 1);

            return npmRequires;
        })
        .then(npmRequires => {
            Trace({ npmRequires }, true);

            if (npmRequires.length > 0)
                return setNpmrc(localRoot, codeLocation)
                    .then(() => runNpm(localRoot, codeLocation, npmRequires));
            else {
                Debug(`No required NPM modules`);
                return Promise.resolve();
            }
        });
}

function setPackageJSON(task, s3Source, codeLocation, startTime) {
    // Pull either a package.json or a defined alternate file (relative to archive root), or generate an empty one

    let packageFileName = task.alternatePackageJson || `package.json`;
    return ListFilesInBucket(s3Source.bucket.name, `${GetPathForArchive(startTime)}/${packageFileName}`)
        .then(foundFiles => {
            if (foundFiles.length > 0) {
                return s3.getObject({ Bucket: s3Source.bucket.name, Key: foundFiles[0].Key }).promise()
                    .then(s3Data => {
                        return JSON.parse(s3Data.Body.toString(`utf8`));
                    });
            } else
                return {
                    name: `lambduh-deployed-application`,
                    version: `1.0.0`,
                    private: true
                };
        })
        .then(packageJSON => {
            Trace({ "package.json to use": packageJSON }, true);

            // Write to the file system at the function root
            let writeLocation = path.join(codeLocation, `package.json`);
            Debug(`Writing package.json to ${writeLocation}`);
            return fs.writeFile(writeLocation, JSON.stringify(packageJSON), { encoding: `utf8` })
                .then(() => { return packageJSON; });
        });
}

function setNpmrc(localRoot, codeLocation) {
    // Read the template file from this function
    return fs.readFile(path.join(process.cwd(), `npmrc_template`), { encoding: `utf8` })
        .then(npmrc => {
            Trace({ "npmrc template": npmrc }, true);

            npmrc = npmrc
                .replace(/%EXTRACTIONLOCATION%/g, codeLocation)
                .replace(/%LOCALROOT%/g, localRoot);

            Debug({ "npmrc": npmrc }, true);

            let npmrcFile = path.join(codeLocation, `.npmrc`);
            Debug(`Writing to ${npmrcFile}`);
            return fs.writeFile(npmrcFile, npmrc, { encoding: `utf8` });
        });
}

function runNpm(localRoot, codeLocation, npmRequires) {
    // Make sure the directories exist that referenced in NPMRC
    Trace(`Create the .npmrc-referenced directories`);
    return fs.ensureDir(path.join(localRoot, `npmConfig`, `cache`))
        .then(() => fs.ensureDir(path.join(localRoot, `home`)))
        .then(() => {
            Dev(`...created`);

            Info(`Run NPM Install in ${codeLocation}`);

            return new Promise((resolve, reject) => {
                let parameters = ([
                    `HOME=${path.join(localRoot, `home`)}`,
                    `npm`,
                    `install`,
                    `--production`
                ]).concat(npmRequires);

                Dev(`env ${parameters.join(` `)}`);

                // let npm = spawn("npm", ["install", "--production", "--prefix", extractionLocation, "--userconfig", `${localRoot}/npmConfig`, "--cache", `${localRoot}/npmConfig/cache`], { cwd: extractionLocation }),
                let npm = spawn(`env`, parameters, { cwd: codeLocation }),
                    runDetails = ``,
                    errDetails = ``;

                npm.stdout.on(`data`, (data) => {
                    runDetails += data;
                });
                npm.stderr.on(`data`, (data) => {
                    errDetails += data;
                });
                npm.on(`error`, (err) => {
                    Fatal(`NPM INSTALL FAILED`);
                    reject(err);
                });
                npm.on(`close`, () => {
                    let newFiles = fs.readdirSync(codeLocation);

                    if (newFiles.indexOf(`npm-debug.log`) >= 0) {
                        let debugLog = null;

                        errDetails += `\nCurrent Directory: \n${newFiles}`;

                        debugLog = fs.readFileSync(path.join(codeLocation, `npm-debug.log`), { encoding: `utf8` });

                        if (!!debugLog) {
                            errDetails += `\n\n----------------npm-debug.log----------------\n\n`;
                            errDetails += debugLog;
                        }

                        reject(errDetails);
                    } else {
                        if (errDetails.length > 0)
                            Warn(`Warnings: ${errDetails}`);
                        Debug(`Install: ${runDetails}`);
                        resolve();
                    }
                });
            });
        });
}

module.exports.ConfigureNPM = configureNpm;
