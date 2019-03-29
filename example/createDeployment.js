// Node Modules
const path = require(`path`);

// NPM Modules
const fs = require(`fs-extra`),
    inquirer = require(`inquirer`),
    jsZip = require(`jszip`),
    { IncludeTimestamp, Warn } = require(`multi-level-logger`);

// Application Modules
const configurationTemplate = require(`./src/template.lamb-duh.configuration.json`),
    { ReadDirectoryContents } = require(`../src/scanDirectory`);


function generateConfiguration() {
    // Ask for a bucket/key to deploy an S3 task to
    Warn(`\nProvide a destination for an S3 task to write a file, or leave empty to skip the S3 example task`);

    let bucketQuestions = [
        {
            name: `bucket`,
            message: `S3 bucket to receive deployment`,
        },
        {
            name: `prefix`,
            message: `Key prefix within the bucket`,
            when: (answers) => {
                return !!answers.bucket && (answers.bucket.trim().length > 0);
            },
        }
    ];

    return inquirer.prompt(bucketQuestions)
        .then(bucketAnswers => {
            // Ask for an IAM role ARN for running a deployed Lambda function
            Warn(`\nProvide the ARN for an IAM role that can run a Lambda function`);

            let iamQuestions = [
                {
                    name: `roleArn`,
                    message: `IAM Role ARN`,
                }
            ];

            return inquirer.prompt(iamQuestions)
                .then(iamAnswers => {
                    return {
                        bucket: bucketAnswers.bucket,
                        prefix: bucketAnswers.prefix,
                        roleArn: iamAnswers.roleArn,
                    };
                });
        })
        .then(answers => {
            // Generate a lamb-duh.configuration.json based on the answers
            let idxS3 = configurationTemplate.tasks.findIndex(task => { return task.type == `S3`; });

            if (!!answers.bucket) {
                configurationTemplate.tasks[idxS3].dest.bucket = answers.bucket;

                if (!!answers.prefix)
                    configurationTemplate.tasks[idxS3].dest.key = answers.prefix;
            } else
                configurationTemplate.tasks.splice(idxS3, 1);

            configurationTemplate.tasks.find(task => { return task.type == `Lambda`; }).default.iamRoleArn = answers.roleArn;

            return fs.writeFile(path.join(__dirname, `src`, `lamb-duh.configuration.json`), JSON.stringify(configurationTemplate, null, 4), { encoding: `utf8` });
        });
}

// Zip the entire ./src directory
function generateCompressedArchive() {
    return ReadDirectoryContents(path.join(__dirname, `src`))
        .then(filesFound => {
            const filesToZip = filesFound
                // Include everything except for the configuration template
                .filter(filePath => { return path.basename(filePath) !== `template.lamb-duh.configuration.json`; })
                // Remove the local path
                .map(filePath => { return filePath.replace(`${path.join(__dirname, `src`)}${path.sep}`, ``); });

            let zip = new jsZip();

            filesToZip.forEach(fileName => {
                let filePath = path.join(__dirname, `src`, fileName);
                zip.file(fileName, fs.readFileSync(filePath));
            });

            // Include the Readme
            zip.file(`Readme.md`, fs.readFileSync(path.join(__dirname, `Readme.md`)));

            // Create the archive in memory
            return zip.generateAsync({ type: `nodebuffer`, compression: `DEFLATE`, compressionOptions: { level: 7 } });
        })
        .then(zippedBuffer => fs.writeFile(path.join(__dirname, `example.zip`), zippedBuffer))
        .then(() => {
            Warn(`\nCompressed archive written to ${path.join(__dirname, `example.zip`)}.`);
            Warn(`\nDeploy by running "lambduh deploy-init" followed by "lambduh deploy" in ${__dirname}.`);
            Warn(`\nSee Lamb-duh documentation for further details.\n`); });
}

function summarize() {
    Warn(`\nLamb-duh Example\n----------------\n\nThis will:`);
    Warn(`  1. Generate a Lamb-duh configuration based on your responses`);
    Warn(`    a. for an S3 bucket/key prefix`);
    Warn(`    b. for an IAM role`);
    Warn(`  2. Generate a compressed archive file that can be deployed, via Lamb-duh, into your AWS environment`);

    return Promise.resolve();
}

IncludeTimestamp(false);

summarize()
    .then(() => generateConfiguration())
    .then(() => generateCompressedArchive());
