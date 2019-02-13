// NPM Modules
const aws = require(`aws-sdk`),
    inquirer = require(`inquirer`),
    { Warn, Err } = require(`multi-level-logger`);

// Application Modules
const { AddRole } = require(`./aws/addRole`),
    { CreateLambdaFunction } = require(`./aws/createFunction`),
    { Configurator } = require(`./aws/policyDocuments`);

/**
 * Ask the user for critical details about their configuration
 */
function collectKeyDetails() {
    let questions = [
        {
            name: `credentialsProfile`,
            message: `Profile name in your AWS Shared Credentials`,
            default: `default`,
            suffix: ` [if different from "default"]:`,
        },
        {
            name: `iamRoleName`,
            message: `New IAM role:`,
            default: `Lamb-duh_Deployment`,
        },
        {
            name: `lambdaFunctionName`,
            message: `Lamb-duh function name in Lambda:`,
            default: (answers) => { return answers.iamRoleName; },
        },
        {
            name: `s3TriggerBucket`,
            message: `Bucket Name:`,
            prefix: `The name of an existing S3 bucket where you will place the compressed file to trigger Lamb-duh\n`,
            validate: (input) => {
                if (input.trim().length == 0)
                    return `S3 Bucket name required`;

                return true;
            },
        },
        {
            type: `confirm`,
            name: `ready`,
            default: false,
            message: `Ready to create IAM role, and S3-integrated Lambda function:`,
        }
    ];

    return inquirer.prompt(questions)
        .then(answers => {
            if (!answers.confirm) {
                Warn(`Re-run this process when you are ready to proceed.`);

                process.exit();
            }

            if (answers.credentialsProfile != `default`)
                aws.config.credentials = new aws.SharedIniFileCredentials({ profile: answers.credentialsProfile });

            return answers;
        });
}

/**
 * Confirm the existence of the S3 triggering bucket before continuing
 * @param {Object} answers - The responses to configuration questions asked of the user
 * @param {Boolean} skipValidation 
 */
function confirmS3Trigger(answers, skipValidation) {
    let s3 = new aws.S3({ apiVersion: `2006-03-01` }),
        pGetBuckets = Promise.resolve();

    if (!skipValidation) {
        Warn(`\nConfirming S3 bucket "${answers.s3TriggerBucket}" exists...`);
        pGetBuckets = s3.listBuckets().promise();
    }

    return pGetBuckets
        .then(data => {
            let foundBucket = null;

            if (!skipValidation) {
                foundBucket = data.Buckets.find(bucket => { return (bucket.Name == answers.s3TriggerBucket); });

                if (!!foundBucket)
                    return Promise.resolve(answers);
                else
                    Warn(`\n...bucket NOT FOUND in S3`);
            }

            if (!foundBucket) {
                Warn(`-----`),
                Warn(`This configuration process WILL NOT create the S3 triggering bucket for you.`);
                Warn(`Please ensure a bucket exists for receiving the compressed deployment packages before continuing.`);
                Warn(`-----`);

                let questions = [
                    {
                        type: `list`,
                        name: `bucketConfirmation`,
                        message: `Confirm when the bucket exists to continue:`,
                        choices: [`Yes`, `No`],
                        default: `No`,
                    }
                ];

                return inquirer.prompt(questions)
                    .then(confirmed => confirmS3Trigger(answers, (confirmed.bucketConfirmation == `No`)));
            }
        })
        .then(answers => {
            Warn(`...Bucket found in S3`);

            // Query the region
            return s3.getBucketLocation({ Bucket: answers.s3TriggerBucket }).promise()
                .then(data => {
                    // Update the configuration to use the region detected (default to N. Virginia for an empty string)
                    aws.config.update({ region: data.LocationConstraint || `us-east-1` });

                    Warn(`Configured to use S3 region of ${data.LocationConstraint || `us-east-1`}`);

                    return answers;
                });
        });
}

/**
 * Display the permissions necessary for running this process
 */
function displayPermissions() {
    Warn(`The configuration process requires an IAM credential with the following permissions:`);
    Warn(`  - ${Configurator.document.Statement[0].Action.join(`\n  - `)}\n`);

    let questions = [
        {
            type: `confirm`,
            name: `showDoc`,
            message: `View these permissions formatted as an IAM policy document?`,
            default: false,
        }
    ];

    return inquirer.prompt(questions)
        .then(answers => {
            if (answers.showDoc) {
                Warn(Configurator.document);

                Warn(`\nThe above JSON can be pasted in as a policy document on an IAM User/Group\n`);
            }
        });
}

/**
 * Completely configure AWS for usage of Lamb-duh
 */
function configureAWS() {
    return displayPermissions()
        .then(() => collectKeyDetails())
        .then(answers => confirmS3Trigger(answers))
        .then(answers => AddRole(answers))
        .then(data => CreateLambdaFunction(data.answers, data.role))
        .catch(err => {
            Err(err);
            Err(`\nlambduh aws-install could not be completed at this time.`);
        });
}

module.exports.ConfigureAWS = configureAWS;
