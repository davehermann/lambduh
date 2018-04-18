"use strict";

const aws = require(`aws-sdk`),
    { DateTime } = require(`luxon`),
    { FunctionConfiguration, GetDeployedName } = require(`../../lambda/lambda`),
    { Dev, Trace, Debug, Info } = require(`../../../logging`);

const lambda = new aws.Lambda({ apiVersion: `2015-03-31` });

function versionAndAliasFunction(serviceDefinition, task, remainingTasks) {
    Trace(`Version and alias ${serviceDefinition.functionName}`);

    // Get the function configuration
    return FunctionConfiguration(GetDeployedName(remainingTasks, serviceDefinition.functionName))
        // Get the ARN for the non-versioned function
        .then(functionConfiguration => { return functionConfiguration.FunctionArn; })
        // Create a new function version
        .then(functionArn => createVersion({ functionArn }))
        // Get all existing aliases to the function
        .then(versioning => getAliases(versioning))
        // Create a new alias to that version, or move a matching existing alias
        .then(versioning => enableNewAlias(versioning, task))
        // Drop matching older aliases
        .then(versioning => dropOldAliases(versioning, task, remainingTasks))
        // Delete function versions that do not have aliases
        .then(versioning => removeUnusedVersions(versioning));
}

function createVersion(versioning) {
    Info(`Tag new function version for ${versioning.functionArn}`);

    return lambda.publishVersion({ FunctionName: versioning.functionArn }).promise()
        .then(lambdaData => {
            Debug(`New version created`);
            Trace({ "version creation": lambdaData }, true);

            versioning.newVersion = lambdaData;
            return versioning;
        });
}

function getAliases(versioning, Marker) {
    if (!versioning.existingAliases || !!Marker) {
        if (!versioning.existingAliases)
            versioning.existingAliases = [];

        return lambda.listAliases({ FunctionName: versioning.functionArn, Marker }).promise()
            .then(lambdaData => {
                Dev({ [`Alias data for ${versioning.functionArn}`]: lambdaData }, true);

                versioning.existingAliases = versioning.existingAliases.concat(lambdaData.Aliases);

                return getAliases(versioning, lambdaData.NextMarker);
            });
    } else {
        Trace({ [`Aliases for ${versioning.functionArn}`]: versioning.existingAliases }, true);
        return Promise.resolve(versioning);
    }
}

function enableNewAlias(versioning, task) {
    return createOrUpdateAlias(task.versionId, versioning)
        .then(versioning => {
            // If versioning the release, also update the non-versioned stage alias
            return (task.versionId !== task.deployment.stage) ? createOrUpdateAlias(task.deployment.stage, versioning) : Promise.resolve(versioning);
        });
}

function createOrUpdateAlias(newAliasName, versioning) {
    // Find a matching alias
    let foundAlias = versioning.existingAliases.filter(alias => { return alias.Name == newAliasName; });
    let isUpdate = foundAlias.length > 0;
    Dev({ "Matching alias": foundAlias }, true);

    let newAlias = {
        FunctionName: versioning.newVersion.FunctionName,
        FunctionVersion: versioning.newVersion.Version,
        Name: newAliasName
    };

    return lambda[isUpdate ? `updateAlias` : `createAlias`](newAlias).promise()
        .then(lambdaData => {
            Debug({ [`Alias ${isUpdate ? `Updated` : `Created`}`]: lambdaData }, true);

            if (!versioning.newAliases)
                versioning.newAliases = [];

            versioning.newAliases.push(lambdaData);

            return versioning;
        });
}

function dropOldAliases(versioning, task, remainingTasks) {
    // Get the existing aliases matching this stage only
    let stageAliases = versioning.existingAliases.filter(alias => { return alias.Name.indexOf(task.deployment.stage) == 0; });

    Trace({ stageAliases }, true);

    let possibleAliasesToDrop = [];
    // Determine the time of the prior aliases' releases
    stageAliases.forEach(alias => {
        if (alias.Name.search(/^\w+_(\d+)$/) == 0)
            possibleAliasesToDrop.push({ alias, aliasCreation: +RegExp.$1 });
    });

    possibleAliasesToDrop.sort((a, b) => { return a.aliasCreation - b.aliasCreation; });
    possibleAliasesToDrop.reverse();

    Trace({ "Possible aliases to drop": possibleAliasesToDrop }, true);

    let versionsToKeep = task.deployment.production ? 3 : 0,
        minimumHoursBeforeDeletion = task.deployment.production ? 12 : 0;

    if (task.deployment.production && !!task.deployment.versioningLimits) {
        versionsToKeep = task.deployment.versioningLimits.keep || versionsToKeep;
        minimumHoursBeforeDeletion = task.deployment.versioningLimits.expirationHours || minimumHoursBeforeDeletion;
    }

    let oldestToKeep = remainingTasks.startTime.minus({ hours: minimumHoursBeforeDeletion });

    Dev({
        versionsToKeep,
        minimumHoursBeforeDeletion,
        runtime: remainingTasks.startTime,
        oldestToKeep
    }, true);

    let aliasesToDrop = possibleAliasesToDrop.filter((alias, idx) => {
        let aliasTime = DateTime.fromFormat(alias.aliasCreation + ``, `yyyyLLddHHmmss`);

        Dev(`${idx}: ${aliasTime}, ${idx >= versionsToKeep} && ${aliasTime < oldestToKeep}`);

        return ((idx >= versionsToKeep) && (aliasTime < oldestToKeep));
    });

    Debug({ "Dropping aliases": aliasesToDrop }, true);

    return deleteAliases(aliasesToDrop.map(alias => { return alias.alias.Name; }), versioning.newVersion.FunctionName)
        .then(() => { return versioning; });

}

function deleteAliases(aliasList, FunctionName) {
    if (aliasList.length > 0)
        return lambda.deleteAlias({ FunctionName, Name: aliasList.shift() }).promise()
            .then(() => deleteAliases(aliasList, FunctionName));
    else
        return Promise.resolve();
}

function removeUnusedVersions(versioning) {
    return getVersions(versioning.functionArn)
        .then(foundVersions => {
            Debug(`Found ${foundVersions.length} versions of ${versioning.functionArn}`);
            Trace({ "Found versions": foundVersions }, true);

            return getAliases({ functionArn: versioning.functionArn })
                .then(removalVersioning => { return { functionArn: removalVersioning.functionArn, foundVersions, foundAliases: removalVersioning.existingAliases }; });
        })
        .then(removalConfiguration => {
            Trace({ removalConfiguration }, true);

            let versionsWithAlias = ([`$LATEST`]).concat(removalConfiguration.foundAliases.map(alias => { return alias.FunctionVersion; }));
            let versionsToDelete = removalConfiguration.foundVersions.filter(version => { return versionsWithAlias.indexOf(version.Version) < 0; }).map(version => { return version.Version; });

            Trace({ versionsWithAlias, versionsToDelete }, true);

            return versionsToDelete;
        })
        .then(versionsToDelete => deleteVersions(versioning.functionArn, versionsToDelete))
        .then(() => { return versioning; });
}

function getVersions(functionArn, foundVersions, Marker) {
    if (!foundVersions || !!Marker) {
        return lambda.listVersionsByFunction({ FunctionName: functionArn, Marker }).promise()
            .then(lambdaData => {
                if (!foundVersions)
                    foundVersions = [];

                foundVersions = foundVersions.concat(lambdaData.Versions);

                return lambdaData.NextMarker;
            })
            .then(Marker => getVersions(functionArn, foundVersions, Marker));
    } else
        return Promise.resolve(foundVersions);
}

function deleteVersions(functionArn, versionList) {
    if (versionList.length > 0) {
        Info(`Removing version #${versionList[0]} from function "${functionArn}"`);
        return lambda.deleteFunction({ FunctionName: functionArn, Qualifier: versionList.shift() }).promise()
            .then(() => {
                Debug(`Version removed`);
            })
            .then(() => deleteVersions(functionArn, versionList));
    } else
        return Promise.resolve();
}

module.exports.VersionAndAliasFunction = versionAndAliasFunction;
module.exports.GetAliases = getAliases;
