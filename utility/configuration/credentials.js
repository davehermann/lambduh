// NPM Modules
const aws = require(`aws-sdk`),
    inquirer = require(`inquirer`),
    { Warn } = require(`multi-level-logger`);

/**
 * Display the permissions necessary for running this process
 * @param {Object} policy - the policy description object
 * @param {String} policy.description - A description of what the policy is for
 * @param {Object} policy.document - The actual AWS policy as a Javascript object
 */
function displayPermissions(policy) {
    Warn(`Your IAM credential will need the following IAM permissions for ${policy.description}.`);
    Warn(`  - ${policy.document.Statement[0].Action.join(`\n  - `)}\n`);

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
                Warn(policy.document);

                Warn(`\nThe above JSON can be pasted in as a policy document on an IAM User/Group\n`);
            }
        });
}

/**
 * Obtain the name of the AWS credentials profile to use, and apply to the SDK if it's not 'default'
 * @param {Object} policy - the policy description object
 * @param {String} policy.description - A description of what the policy is for
 * @param {Object} policy.document - The actual AWS policy as a Javascript object
 */
function getCredentialsProfile(policy) {
    return displayPermissions(policy)
        .then(() => {
            const questions = [
                {
                    name: `credentialsProfile`,
                    message: `AWS Shared Credentials profile:`,
                    default: `default`,
                    prefix: `Leave as "default" if you use environment variables or have only one profile\n`,
                },
            ];

            return inquirer.prompt(questions)
                .then(answers => {
                    if (answers.credentialsProfile != `default`)
                        aws.config.credentials = new aws.SharedIniFileCredentials({ profile: answers.credentialsProfile });
                });
        });
}

module.exports.UseProfile = getCredentialsProfile;
