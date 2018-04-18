"use strict";

const aws = require(`aws-sdk`),
    uuid = require(`uuid`),
    { Trace, Debug, Info } = require(`../../../logging`);

const lambda = new aws.Lambda({ apiVersion: `2015-03-31` });

function addEventInvocationPermission(FunctionName, SourceArn, Principal) {
    let newPermission = {
        FunctionName,
        StatementId: uuid.v4(),
        Action: `lambda:InvokeFunction`,
        Principal,
        SourceArn
    };

    Debug(`Adding Invoke permission for the Lambda function`);
    Trace({ newPermission }, true);

    return clearPermissions(newPermission)
        .then(() => lambda.addPermission(newPermission).promise())
        .then(lambdaData => {
            Debug({ "Lambda permission added": lambdaData }, true);
        });
}

function clearPermissions(newPermission) {
    let findPolicy = {
        FunctionName: newPermission.FunctionName,
        Qualifier: newPermission.Qualifier
    };

    Info(`Clearing existing policy`);

    return lambda.getPolicy(findPolicy).promise()
        .catch(err => {
            if (err.code == `ResourceNotFoundException`) {
                Debug(`Skipping removal of existing permissions as no policy object exists`);
                return null;
            } else
                return Promise.reject(err);
        })
        .then(existingPolicy => {
            let matchingPolicies = [];

            if (!!existingPolicy) {
                Debug(`Existing Policies Found -- Will be removed before adding new permissions`);
                Trace({ existingPolicy }, true);

                // Find any policy statements that have the same FunctionName, Principal and SourceArn
                let attachedPolicies = JSON.parse(existingPolicy.Policy).Statement;
                Debug(`${attachedPolicies.length} attached to policy`);

                attachedPolicies.forEach(policy => {
                    if (
                        (policy.Resource == newPermission.FunctionName)
                        && (policy.Principal.Service == newPermission.Principal)
                        && (policy.Condition.ArnLike[`AWS:SourceArn`] == newPermission.SourceArn)
                    )
                        matchingPolicies.push(policy);
                });
                Debug(`${matchingPolicies.length} matching will be removed`);
            }

            return matchingPolicies;
        })
        // Remove each matching policy
        .then(matchingPolicies => removePermissions(matchingPolicies));
}

function removePermissions(permissionList) {
    if (permissionList.length > 0) {
        let permissionToDrop = permissionList.shift();

        return lambda.removePermission({ FunctionName: permissionToDrop.Resource, StatementId: permissionToDrop.Sid }).promise()
            .then(() => { Debug(`Dropped ${permissionToDrop.Sid}`); })
            .then(() => removePermissions(permissionList));
    } else
        return Promise.resolve();
}

module.exports.AddInvocationPermissions = addEventInvocationPermission;
