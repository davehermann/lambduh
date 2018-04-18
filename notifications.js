"use strict";

const aws = require(`aws-sdk`),
    { DateTime } = require(`luxon`);

const sns = new aws.SNS({ apiVersion: `2010-03-31` }),
    standardFormat = `yyyy-LL-dd HH:mm:ss ZZZZ`;

// Send SNS notifications
function sendNotification(remainingTasks, Message, Subject) {
    let snsConfiguration = remainingTasks.snsNotifications;

    if (!!snsConfiguration && !!snsConfiguration.topicArn) {
        return sns.publish({ TopicArn: snsConfiguration.topicArn, Message, Subject }).promise();
    } else
        return Promise.resolve();
}

function subject(remainingTasks, startTime) {
    return `Lamb_duh deployment: ${remainingTasks.applicationName} at ${startTime.toFormat(standardFormat)}`;
}

function startupNotification(remainingTasks) {
    let startTime = !!remainingTasks.snsNotifications && !!remainingTasks.snsNotifications.timeZone ? remainingTasks.startTime.setZone(remainingTasks.snsNotifications.timeZone) : remainingTasks.startTime;

    let message = `Beginning deployment of ${remainingTasks.applicationName} application at ${startTime.toFormat(standardFormat)}.`;

    message += `\n\nTotal tasks: ${remainingTasks.tasks.length}`;
    let lambdaTasks = remainingTasks.tasks.filter(task => { return task.type.toLowerCase() == `lambda`; });
    let gatewayTasks = remainingTasks.tasks.filter(task => { return task.type.toLowerCase() == `apigateway`; });

    let s3Tasks = remainingTasks.tasks.filter(task => { return task.type.toLowerCase() == `s3`; });
    if (s3Tasks.length > 0)
        message += `\n -- S3 tasks: ${s3Tasks.length}`;

    if (lambdaTasks.length > 0) {
        message += `\n -- Lambda tasks: ${lambdaTasks.length}`;

        let allFunctions = 0;
        lambdaTasks.forEach(task => { allFunctions += task.functions.length; });

        message += `\n ----- Total functions: ${allFunctions}`;
    }

    if (gatewayTasks.length > 0) {
        message += `\n -- API Gateway tasks: ${gatewayTasks.length}`;

        let allEndpoints = 0,
            allNonEndpoints = 0;
        gatewayTasks.forEach(task => {
            allEndpoints += task.endpoints.length;
            allNonEndpoints += task.aliasNonEndpoints.length;
            message += `\n ----- Deploy to ${task.deployment.production ? `versioned` : `non-versioned`} stage: ${task.deployment.stage}`;
        });

        if (allEndpoints > 0)
            message += `\n ----- Total endpoints: ${allEndpoints}`;
        if (allNonEndpoints > 0)
            message += `\n ----- Total non-endpoint aliases: ${allNonEndpoints}`;
    }

    return sendNotification(remainingTasks, message, subject(remainingTasks, startTime));
}

function completionNotification(remainingTasks) {
    let currentTime = DateTime.utc(),
        startTime = remainingTasks.startTime;

    if (!!remainingTasks.snsNotifications && !!remainingTasks.snsNotifications.timeZone) {
        startTime = startTime.setZone(remainingTasks.snsNotifications.timeZone);
        currentTime = currentTime.setZone(remainingTasks.snsNotifications.timeZone);
    }

    let message = `Deployment of ${remainingTasks.applicationName} complete at ${currentTime.toFormat(standardFormat)}`;
    let elapsedTime = currentTime.diff(startTime).shiftTo(`hours`, `minutes`, `seconds`).normalize().toObject(),
        elapsedParts = [];
    for (let prop in elapsedTime)
        elapsedParts.push(`${elapsedTime[prop]} ${prop}`);

    message += `\n\nCompleted using ${remainingTasks.index} invocations in ${elapsedParts.join(`, `)}.`;

    if (!!remainingTasks.deployedApis) {
        message += `\n\nUse the following URL to access the deployment:`;
        remainingTasks.deployedApis.forEach(deployment => {
            deployment.aliases.forEach(alias => {
                message += `\nhttps://${deployment.apiId}.execute-api.${remainingTasks.awsRegion}.amazonaws.com/${alias}`;
            });
        });
    }

    return sendNotification(remainingTasks, message, subject(remainingTasks, startTime));
}

module.exports.StartupNotification = startupNotification;
module.exports.CompletionNotification = completionNotification;
