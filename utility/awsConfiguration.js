// NPM Modules
const aws = require(`aws-sdk`),
    inquirer = require(`inquirer`),
    { Warn, Err } = require(`multi-level-logger`);

// Application Modules
const { AddRole } = require(`./aws/addRole`),
    { CreateLambdaFunction } = require(`./aws/createFunction`),
    { Configurator } = require(`./aws/policyDocuments`),
    { GetS3TriggerBucket } = require(`./aws/s3`),
    { UseProfile } = require(`./configuration/credentials`);

/**
 * Ask the user for critical details about their configuration
 */
function collectKeyDetails() {
    let questions = [
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

    return inquirer.prompt(questions);
}

/**
 * Confirm with the user before beginning the configuration process
 * @param {Object} originalAnswers - answers to the prompted questions
 * @returns {Object} The answers object if the user is proceeding
 */
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
 * Completely configure AWS for usage of Lamb-duh
 */
function configureAWS() {
    return UseProfile(Configurator)
        .then(() => collectKeyDetails())
        .then(answers => GetS3TriggerBucket(answers))
        .then(answers => confirmStart(answers))
        .then(answers => AddRole(answers))
        .then(data => CreateLambdaFunction(data.answers, data.role))
        .catch(err => {
            Err(err, true);
            Err(`\nlambduh aws-install could not be completed at this time.`);
        });
}

module.exports.ConfigureAWS = configureAWS;
