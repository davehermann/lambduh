"use strict";

const aws = require(`aws-sdk`),
    { DateTime } = require(`luxon`);

const sns = new aws.SNS({ apiVersion: `2010-03-31` }),
    standardFormat = `yyyy-LL-dd HH:mm:ss ZZZZ`;

let taskConfiguration = null;

function setTaskConfiguration(remainingTasks) {
    taskConfiguration = remainingTasks;
}

// Send SNS notifications
function sendNotification(Message, Subject) {
    if (!!taskConfiguration && !!taskConfiguration.snsNotifications && !!taskConfiguration.snsNotifications.topicArn) {
        return sns.publish({ TopicArn: taskConfiguration.snsNotifications.topicArn, Message, Subject }).promise();
    } else
        return Promise.resolve();
}

function subject(startTime) {
    let applicationName = !!taskConfiguration ? taskConfiguration.applicationName : `UNKNOWN`;
    return `Lamb_duh deployment: ${applicationName} at ${startTime.toFormat(standardFormat)}`;
}

function startupNotification() {
    let startTime = !!taskConfiguration.snsNotifications && !!taskConfiguration.snsNotifications.timeZone ? taskConfiguration.startTime.setZone(taskConfiguration.snsNotifications.timeZone) : taskConfiguration.startTime;

    let message = `Beginning deployment of ${taskConfiguration.applicationName} application at ${startTime.toFormat(standardFormat)}.`;

    message += `\n\nTotal tasks: ${taskConfiguration.tasks.length}`;
    let lambdaTasks = taskConfiguration.tasks.filter(task => { return task.type.toLowerCase() == `lambda`; });
    let gatewayTasks = taskConfiguration.tasks.filter(task => { return task.type.toLowerCase() == `apigateway`; });

    let s3Tasks = taskConfiguration.tasks.filter(task => { return task.type.toLowerCase() == `s3`; });
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
            if (!!task.endpoints)
                allEndpoints += task.endpoints.length;
            if (!!task.aliasNonEndpoints)
                allNonEndpoints += task.aliasNonEndpoints.length;
            message += `\n ----- Deploy to ${task.deployment.production ? `versioned` : `non-versioned`} stage: ${task.deployment.stage}`;
        });

        if (allEndpoints > 0)
            message += `\n ----- Total endpoints: ${allEndpoints}`;
        if (allNonEndpoints > 0)
            message += `\n ----- Total non-endpoint aliases: ${allNonEndpoints}`;
    }

    return sendNotification(message, subject(startTime));
}

function completionNotification() {
    let currentTime = DateTime.utc(),
        startTime = taskConfiguration.startTime;

    if (!!taskConfiguration.snsNotifications && !!taskConfiguration.snsNotifications.timeZone) {
        startTime = startTime.setZone(taskConfiguration.snsNotifications.timeZone);
        currentTime = currentTime.setZone(taskConfiguration.snsNotifications.timeZone);
    }

    let message = `Deployment of ${taskConfiguration.applicationName} complete at ${currentTime.toFormat(standardFormat)}`;
    let elapsedTime = currentTime.diff(startTime).shiftTo(`hours`, `minutes`, `seconds`).normalize().toObject(),
        elapsedParts = [];
    for (let prop in elapsedTime)
        elapsedParts.push(`${elapsedTime[prop]} ${prop}`);

    message += `\n\nCompleted using ${taskConfiguration.index} invocations in ${elapsedParts.join(`, `)}.`;

    if (!!taskConfiguration.deployedApis) {
        message += `\n\nUse the following URL to access the deployment:`;
        taskConfiguration.deployedApis.forEach(deployment => {
            deployment.aliases.forEach(alias => {
                message += `\nhttps://${deployment.apiId}.execute-api.${taskConfiguration.awsRegion}.amazonaws.com/${alias}`;
            });
        });
    }

    return sendNotification(message, subject(startTime));
}

function errorNotification(err) {
    let startTime = DateTime.utc();
    let message = `Lamb_duh deployment error.`;

    message += `\nThe following error occurred during execution`;
    if (!!taskConfiguration) {
        startTime = taskConfiguration.startTime;
        if (!!taskConfiguration.snsNotifications && !!taskConfiguration.snsNotifications.timeZone)
            startTime = startTime.setZone(taskConfiguration.snsNotifications.timeZone);

        message += ` of ${taskConfiguration.applicationName} started at ${startTime.toFormat(standardFormat)}`;
    }

    message += `:\n\n${JSON.stringify(err, null, 4)}`;
    message += `\n\nPlease review the execution logs for more details`;

    return sendNotification(message, subject(startTime));
}

module.exports.SetNotificationConfiguration = setTaskConfiguration;
module.exports.StartupNotification = startupNotification;
module.exports.CompletionNotification = completionNotification;
module.exports.ErrorNotification = errorNotification;
