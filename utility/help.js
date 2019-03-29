// NPM Modules
const { Warn } = require(`multi-level-logger`);

/**
 * Display help text
 */
// eslint-disable-next-line no-unused-vars
function displayHelp(options) {
    let helpText;

    helpText =
        `--- Help ---\n`
        + `\n`
        + `Usage: lamb-duh COMMAND\n`
        + `\n`
        + `Commands\n`
        + `--------\n`
        + `    aws-install              Add Lamb-duh to AWS Lambda with S3-triggers, and all necessary permissions\n`
        + `    aws-update               When previously installed/configured, updates Lamb-duh in AWS to latest version\n`
        + `    deploy-init              Generates a configuration file for the "deploy" command by asking a series of questions\n`
        + `    deploy-s3-permissions    Adds the permissions for any S3 tasks in a configuration task list to the Lamb-duh role in IAM\n`
        + `    deploy                   Copy compressed source file to destination S3 bucket\n`
    ;

    Warn(`${helpText}`);

    return Promise.resolve();
}

module.exports.ShowHelp = displayHelp;
