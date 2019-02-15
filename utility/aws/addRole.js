// NPM Modules
const aws = require(`aws-sdk`),
    { Warn } = require(`multi-level-logger`);

// Application Modules
const { PermissionSet, TrustedEntity } = require(`./policyDocuments`),
    { LambduhObjectTag } = require(`../utilities`),
    { Throttle } = require(`../../src/tasks/apiGateway/throttle`);

/**
 * Add each set of permissions to an IAM role
 * @param {string} role - Role creation data for the IAM role
 * @param {Object} answers - The responses to configuration questions asked of the user
 * @param {Array<Object>} remainingPermissions - List of permissions still to add
 */
function addPermissionsToIAMRole(role, answers, remainingPermissions) {
    const iam = new aws.IAM({ apiVersion: `2010-05-08` });

    if (remainingPermissions.length > 0) {
        let policy = remainingPermissions.shift();

        Warn(`Adding permissions for ${policy.name} to "${role.roleName}"`);

        // Add all necessary permissions in-line
        const policyParams = {
            PolicyDocument:
                JSON.stringify(policy.document)
                    .replace(/\{TRIGGER_BUCKET_NAME\}/g, answers.s3TriggerBucket),
            PolicyName: policy.name.replace(/ /g, `_`),
            RoleName: role.roleName,
        };

        return iam.putRolePolicy(policyParams).promise()
            // Throttle next request in case AWS ever throttles API
            .then(() => Throttle(null, 250))
            .then(() => addPermissionsToIAMRole(role, answers, remainingPermissions));

    }

    return Promise.resolve(role);
}

/**
 * Create a new IAM Role for the Lambda process, and add needed permissions
 * @param {Object} answers - The responses to configuration questions asked of the user
 */
function addRoleToIAM(answers) {
    const iam = new aws.IAM({ apiVersion: `2010-05-08` });

    Warn(`Creating new role "${answers.iamRoleName}"`);

    // Create a new role
    const newRoleParams = {
        RoleName: answers.iamRoleName,
        AssumeRolePolicyDocument: JSON.stringify(TrustedEntity.document),
        Description: `Lamb-duh role for deploying applications`,
    };

    return iam.createRole(newRoleParams).promise()
        .then(data => {
            Warn(`New "${newRoleParams.RoleName}" IAM role created`);

            return { roleName: data.Role.RoleName, arn: data.Role.Arn };
        })
        .then(role => addPermissionsToIAMRole(role, answers, PermissionSet))
        // Add Tags
        .then(role => {
            Warn(`Tagging "${role.roleName}"`);

            let Tags = [];
            for (let prop in LambduhObjectTag)
                Tags.push({ Key: prop, Value: LambduhObjectTag[prop] });

            return iam.tagRole({ RoleName: role.roleName, Tags }).promise()
                .then(() => { return role; });
        })
        .then(role => Promise.resolve({ answers, role }));
    // Will need all known deploy-into buckets
}

module.exports.AddRole = addRoleToIAM;
