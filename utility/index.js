#!/usr/bin/env node

// NPM Modules
const { IncludeTimestamp, InitializeLogging, Warn, Err } = require(`multi-level-logger`);

// Application Modules
const { ConfigureAWS } = require(`./awsConfiguration`),
    { CreateDeploymentConfiguration } = require(`./deploymentConfiguration`),
    { DeployPackage } = require(`./deployPackage`),
    { ShowHelp } = require(`./help`),
    { AddS3TaskPermissions } = require(`./s3TaskPermissions`);

/**
 * Return a usable array of the command line parameters
 */
function getArguments() {
    return process.argv.filter(() => { return true; });
}

/**
 * Convert arguments passed in into usable format
 */
function parseArguments() {
    let argsArray = getArguments(),
        actions = [];

    while (argsArray.length > 0) {
        let nextArg = argsArray.shift();

        switch (nextArg) {
            case `deploy-init`:
                // If any argument is "init", only run init
                actions = [{ description: `Configuring for Deployment`, action: CreateDeploymentConfiguration }];
                argsArray = [];
                break;

            case `deploy`:
                actions.push({ description: `Starting deployment`, action: DeployPackage });
                break;

            case `aws-install`:
                actions.push({ description: `Configuring AWS for Lamb-duh`, action: ConfigureAWS });
                break;

            case `deploy-s3-permissions`:
                actions = [{ description: `Adding permissions to S3`, action: AddS3TaskPermissions }];
                break;
        }
    }

    if (actions.length == 0)
        actions.push({ action: ShowHelp });

    return Promise.resolve(actions);
}

function runActions(remainingActions, isFirst) {
    if (isFirst)
        Warn(`\n--- Lamb-duh Serverless Deployment ---\n`);

    if (remainingActions.length > 0) {
        let nextAction = remainingActions.shift();

        if (!!nextAction.description) {
            Warn(nextAction.description);
            Warn((``).padStart(nextAction.description.length, `-`));
        }

        return nextAction.action(nextAction.options)
            .then(() => runActions(remainingActions));
    } else
        return Promise.resolve();
}

InitializeLogging(`info`);
IncludeTimestamp(false);

parseArguments()
    .then(actions => runActions(actions, true))
    // Catch any unhandled errors
    .catch(err => Err(err, true));
