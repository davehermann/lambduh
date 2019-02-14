// NPM Modules
const aws = require(`aws-sdk`),
    inquirer = require(`inquirer`),
    { Warn, Err } = require(`multi-level-logger`);

// Application Modules
const { AddRole } = require(`./aws/addRole`),
    { CreateLambdaFunction } = require(`./aws/createFunction`),
    { Configurator } = require(`./aws/policyDocuments`),
    { GetS3TriggerBucket } = require(`./aws/s3`);

/**
 * Ask the user for critical details about their configuration
 */
function collectKeyDetails() {
    let questions = [
        {
            name: `credentialsProfile`,
            message: `AWS Shared Credentials profile:`,
            default: `default`,
            prefix: `Leave as "default" if you use environment variables or have only one profile\n`,
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
    ];

    return inquirer.prompt(questions)
        .then(answers => {
            if (answers.credentialsProfile != `default`)
                aws.config.credentials = new aws.SharedIniFileCredentials({ profile: answers.credentialsProfile });

            return answers;
        });
}

function confirmStart(originalAnswers) {
    let questions = [
        {
            type: `confirm`,
            name: `ready`,
            default: false,
            message: `Ready to create IAM role, and S3-integrated Lambda function, with above values?`,
        }
    ];

    return inquirer.prompt(questions)
        .then(answers => {
            if (!answers.ready) {
                Warn(`Re-run this process when you are ready to proceed.`);

                process.exit();
            }

            return originalAnswers;
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
        .then(answers => GetS3TriggerBucket(answers))
        .then(answers => confirmStart(answers))
        .then(answers => AddRole(answers))
        .then(data => CreateLambdaFunction(data.answers, data.role))
        .catch(err => {
            Err(err);
            Err(`\nlambduh aws-install could not be completed at this time.`);
        });
}

module.exports.ConfigureAWS = configureAWS;
