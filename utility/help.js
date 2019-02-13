/**
 * Display help text
 */
function displayHelp(options) {
    let helpText;

    if (options === `aws-install`)
        helpText =
            `--- lambduh aws-install ---\n`
            + `\n`
            + `Install Lamb-duh code as a function in AWS Lambda.\n`
            + `Also create all needed permissions in an new IAM role.\n`
            + `The Lamb-duh project documentation contains all IAM permissions necessary for operation\n`
            + `\n`
            + `Your AWS credentials must have the following permissions to run the "aws-install" task:\n`
            + `    IAM\n`
            + `        - CreateRole\n`
            + `        - PutRolePolicy\n`
            + `\n`
            + `Credentials for this operation should be managed through AWS Shared Credentials.\n`
            + `You will have the opportunity to specify a credentials profile as part of the process.\n`
        ;
    else
        helpText =
            `--- Help ---\n`
            + `\n`
            + `Usage: lambduh COMMAND [options]\n`
            + `\n`
            + `Commands\n`
            + `--------\n`
            + `    init                 Generates a configuration file for deployment by asking a series of questions\n`
            + `    deploy               Copy compressed source file to destination S3 bucket\n`
            + `    aws-install [help]   Add Lamb-duh to AWS Lambda with S3-triggers, and all necessary permissions\n`
            + `                         - Including the "help" parameter will provide specifics, included actual permissions created\n`
        ;

    // eslint-disable-next-line no-console
    console.log(`${helpText}`);

    return Promise.resolve();
}

module.exports.ShowHelp = displayHelp;
