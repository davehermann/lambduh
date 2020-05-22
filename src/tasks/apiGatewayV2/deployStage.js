"use strict";

const aws = require(`aws-sdk`),
    { GetRoutesForApi } = require(`./apiResources/getRoutes`),
    { Throttle } = require(`../apiGateway/throttle`),
    { Trace, Debug, Info, Warn } = require(`../../logging`);

const apiGatewayV2 = new aws.ApiGatewayV2({ apiVersion: `2018-11-29` });

function deployStage(task, remainingTasks) {
    if (!task.stagesToDeploy)
        return checkForNewResources(task);
    else
        return releaseStage(task, remainingTasks);
}

function checkForNewResources(task) {
    return getStagesForApi(task.apiId)
        .then(stages => {
            /*
                Only deploy when:
                    + A stage does not exist
                    + A new alias has been created on a function
                    + TO DO: An alias points to a function version that post-dates the last deployment

            let existingStageNames = stages.map(stage => { return stage.StageName; });
            let aliasesToDeploy = task.versionAliases.filter(alias => {
                return (task.createdAliases.indexOf(alias) >= 0) || (existingStageNames.indexOf(alias) < 0);
            });

            FOR NOW, ALWAYS DEPLOY
            */
            let aliasesToDeploy = task.versionAliases.filter(() => { return true; });

            if (aliasesToDeploy.length > 0)
                return GetRoutesForApi(task.apiId)
                    .then(apiRoutes => {
                        task.stagesToDeploy = aliasesToDeploy.map(alias => { return { stageName: alias, resources: apiRoutes.filter(() => { return true; }) }; });
                    });
            else {
                // Set stagesToDeploy to an empty array to drop the deployment task
                task.stagesToDeploy = [];

                Warn(`No newly created aliases to deploy`);

                return Promise.resolve();
            }
        });
}

function releaseStage(task) {
    // TO DO: Build a versioned deployment as exists for the Rest APIs

    return pushDeployment(task);
}

function pushDeployment(task) {
    let currentStage = task.stagesToDeploy.shift();

    // Create the stage if it doesn't exist
    return getStagesForApi(task.apiId)
        .then(foundStages => {
            let existingStages = foundStages.filter(stage => { return stage.StageName == currentStage.stageName; });

            if (existingStages.length > 1)
                return Promise.reject(new Error(`${existingStages.length} stages found named ${currentStage.stageName}`));

            return (existingStages.length == 1) ? Promise.resolve(existingStages[0]) : createStage(task.apiId, currentStage.stageName);
        })
        // Deploy the stage
        .then(stage => createDeployment(task.apiId, stage.StageName));
}

function createDeployment(ApiId, StageName) {
    Debug(`Deploying stage: ${StageName}`);

    return apiGatewayV2.createDeployment({ ApiId, StageName }).promise()
        .then(createdDeployment => {
            Info({ createdDeployment }, true);
            return createdDeployment;
        });
}

function createStage(ApiId, StageName) {
    Info(`Creating stage: ${StageName}`);

    return apiGatewayV2.createStage({ ApiId, StageName }).promise()
        .then(createdStage => {
            Debug({ createdStage }, true);
            return createdStage;
        });
}

function getStagesForApi(ApiId, NextToken, foundStages) {
    if (!foundStages || !!NextToken)
        return apiGatewayV2.getStages({ ApiId }).promise()
            .then(stages => Throttle(stages, 500))
            .then(stages => {
                if (!foundStages)
                    foundStages = [];

                foundStages = foundStages.concat(stages.Items);

                return getStagesForApi(ApiId, stages.NextToken, foundStages);
            });
    else {
        Trace({ foundStages }, true);
        return Promise.resolve(foundStages);
    }
}

module.exports.DeployStage = deployStage;
