#!/usr/bin/env node

const { CreateDeploymentConfiguration } = require(`./deploymentConfiguration`),
    { DeployPackage } = require(`./deployPackage`),
    { ShowHelp } = require(`./help`);

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
            case `init`:
                // If any argument is "init", only run init
                actions = [{ description: `Configuring for Deployment`, action: CreateDeploymentConfiguration }];
                argsArray = [];
                break;

            case `deploy`:
                actions.push({ description: `Starting deployment`, action: DeployPackage });
                break;
        }
    }

    if (actions.length == 0)
        actions.push({ action: ShowHelp });

    return Promise.resolve(actions);
}

function runActions(remainingActions, isFirst) {
    if (isFirst)
        // eslint-disable-next-line no-console
        console.log(`\n--- Lamb-duh Serverless Deployment ---\n`);

    if (remainingActions.length > 0) {
        let nextAction = remainingActions.shift();

        if (!!nextAction.description) {
            // eslint-disable-next-line no-console
            console.log(nextAction.description);
            // eslint-disable-next-line no-console
            console.log((``).padStart(nextAction.description.length, `-`));
        }

        return nextAction.action()
            .then(() => runActions(remainingActions));
    } else
        return Promise.resolve();
}

parseArguments()
    .then(actions => runActions(actions, true));
