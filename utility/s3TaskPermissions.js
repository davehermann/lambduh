// Node Modules
const path = require(`path`);

// NPM Modules
const aws = require(`aws-sdk`),
    fs = require(`fs-extra`),
    inquirer = require(`inquirer`),
    { Trace, Debug, Info, Warn } = require(`multi-level-logger`);

// Application Modules
const { AddInlinePoliciesToIAMRole } = require(`./aws/addRole`),
    { S3Permissions, S3WriteTo } = require(`./aws/policyDocuments`),
    { UseProfile } = require(`./configuration/credentials`),
    { ReadDeploymentConfiguration } = require(`./configuration/locate`);

// Define iam object for the entire module, but do not configure as credentials are assigned after process start
let iam;

/**
 * Read the app-local configuration
 * The default ./lamb-duh.configuration.json can be overridden with {lambduhConfigurationFile} in the app-local lamb-duh.deployment.json
 */
function findLambduhConfiguration() {
    return ReadDeploymentConfiguration()
        .then(config => { return !!config ? config.lambduhConfigurationFile : null; })
        .then(specifiedLocation => { return specifiedLocation || path.join(process.cwd(), `lamb-duh.configuration.json`); })
        // Read the JSON file at the path
        .then(configFilePath => fs.readFile(configFilePath, { encoding: `utf8` }))
        .then(config => { return JSON.parse(config); });
}

/**
 * Find all S3 tasks in the app's configuration, including any set as disabled
 * @param {Object} configuration - the configuration data used by the Lamb-duh service
 */
function extractS3Tasks(configuration) {
    let s3Tasks = configuration.tasks.filter(task => { return task.type.search(/^s3$/i) == 0; });

    if (s3Tasks.length == 0)
        Warn(`No S3 tasks found in the Lamb-duh configuration`);
    else {
        // Get the buckets from those tasks
        let buckets = [];
        s3Tasks.forEach(task => {
            if (buckets.indexOf(task.dest.bucket) < 0)
                buckets.push(task.dest.bucket);
        });
        buckets.sort();

        // List the buckets in those tasks for the user
        Info(`To add permissions, all S3 tasks - including any marked as "disabled" will be included in the bucket list:`);
        Info(buckets.map(bucket => { return `Bucket: ${bucket}`; }).join(`\n`));

        return buckets;
    }

    process.exit();
}

/**
 * Retrieve the entire role list for the user
 * @param {Array<map>} foundRoles - List of roles found so far 
 * @param {String} Marker - AWS SDK marker for next page of results
 * @returns {Array<map>} All found roles 
 */
function listAllRoles(foundRoles, Marker) {
    if (!!Marker || !foundRoles) {
        if (!foundRoles)
            foundRoles = [];

        return iam.listRoles({ Marker }).promise()
            .then(data => {
                foundRoles = foundRoles.concat(data.Roles);

                return listAllRoles(foundRoles, data.Marker);
            });
    } else
        return Promise.resolve(foundRoles);
}

/**
 * Pull full details for each role as the listRoles function does not include Tags (despite including a Tags property)
 * @param {Array<map>} roleList - remaining roles to pull 
 * @param {Array<map>} roleData - complete list of found role data 
 */
function getAllRoles(roleList, roleData) {
    if (!roleData)
        roleData = [];

    if (roleList.length > 0) {
        let nextRole = roleList.shift();
        return iam.getRole({ RoleName: nextRole.RoleName }).promise()
            .then(data => {
                roleData.push(data.Role);
            })
            .then(() => getAllRoles(roleList, roleData));
    } else
        return Promise.resolve(roleData);
}

/**
 * Select the Lamb-duh role that is used by the Lamb-duh function in Lambda
 * @param {Array<string>} foundBuckets - list of buckets in configuration
 */
function selectIAMRoleUsedByLambduh(foundBuckets) {
    // Attempt auto-select by searching all roles for one tagged for Lamb-duh, or one named with "lambduh" in it
    Warn(`Analyzing all known roles`);
    return listAllRoles()
        .then(roles => getAllRoles(roles))
        .then(roles => {
            let pSelectedRole = Promise.resolve(null);

            // Find {Lamb-duh Resource: true} tags
            let lambduhRoles = roles.filter(role => { return !!role.Tags.find(tag => { return (tag.Key.search(/Lamb-duh Resource/i) >= 0) && tag.Value; }); });

            if (lambduhRoles.length > 0) {
                let roleList = lambduhRoles.map(role => { return role.RoleName; });
                roleList.push({ name: `Show all roles`, value: null });

                let questions = [
                    {
                        name: `roleForProcess`,
                        type: `list`,
                        choices: roleList,
                        message: `Select Role`,
                    }
                ];
                pSelectedRole = inquirer.prompt(questions)
                    .then(answers => {
                        return answers.roleForProcess;
                    });
            }

            return pSelectedRole
                .then(selectedRole => {
                    return { roles, selectedRole };
                });
        })
        .then(roleSelection => {
            if (!!roleSelection.selectedRole)
                return Promise.resolve(roleSelection.selectedRole);

            // List all roles if auto-select doesn't work, or is manually cancelled
            let roleList = roleSelection.roles.map(role => { return role.RoleName; });

            let questions = [
                {
                    name: `roleForProcess`,
                    type: `list`,
                    choices: roleList,
                    message: `Select Role`,
                }
            ];
            return inquirer.prompt(questions)
                .then(answers => {
                    return answers.roleForProcess;
                });
        })
        .then(selectedRole => {
            return { foundBuckets, selectedRole };
        });
}

/**
 * List of inline policies attached to the role
 * @param {String} RoleName - name of the role
 * @param {Array<String>} [policyList] - policy names found so far, generated by the first iteration of the function
 * @param {String} [Marker] - Marker for subsequent requests if the list is truncated, generated by the first iteration of the function
 * @returns {Array<String>} list of policy names
 */
function getPolicyNamesForRole(RoleName, policyList, Marker) {
    if (!!Marker || !policyList) {
        if (!policyList)
            policyList = [];

        return iam.listRolePolicies({ RoleName, Marker }).promise()
            .then(data => {
                policyList = policyList.concat(data.PolicyNames);

                return getPolicyNamesForRole(RoleName, policyList, data.Marker);
            });
    } else
        return Promise.resolve(policyList);
}

/**
 * Get all existing policies, and remove any needed policies that already exist from the list of needed policies
 * @param {String} RoleName - name of role
 * @param {Object} bucketsNeeded - Map of bucket names with the correct policy document for write permissions to that bucket
 * @param {Array<String>} [remainingPolicies] - List of policies not yet processed, generated by the first iteration of the function
 * @param {Array<String>} [matchingPoliciesFound] - List of bucket names found that already have exact match policies, generated after the first iteration of the function
 * @returns {Object} bucketsNeeded object, with any existing policies removed
 */
function getPoliciesForRole(RoleName, bucketsNeeded, remainingPolicies, matchingPoliciesFound) {
    if (!remainingPolicies)
        return getPolicyNamesForRole(RoleName)
            .then(policyNames => getPoliciesForRole(RoleName, bucketsNeeded, policyNames));

    if (remainingPolicies.length > 0) {
        if (!matchingPoliciesFound)
            matchingPoliciesFound = [];

        let PolicyName = remainingPolicies.shift();
        Debug(`Checking ${PolicyName} for bucket permissions`);

        return iam.getRolePolicy({ RoleName, PolicyName }).promise()
            .then(policy => {
                let policyDocument = JSON.parse(decodeURIComponent(policy.PolicyDocument));
                Trace(policyDocument);

                // Check for an exact-match policy for each bucket
                let statement = JSON.stringify(policyDocument.Statement);

                for (let bucketName in bucketsNeeded) {
                    let bucketPolicy = JSON.stringify(JSON.parse(bucketsNeeded[bucketName]).Statement);

                    if (statement === bucketPolicy)
                        matchingPoliciesFound.push(bucketName);
                }

                matchingPoliciesFound.forEach(bucketName => { delete bucketsNeeded[bucketName]; });

                return getPoliciesForRole(RoleName, bucketsNeeded, remainingPolicies, matchingPoliciesFound);
            });
    } else
        return bucketsNeeded;
}

/**
 * Add all needed bucket policies to the role
 * @param {String} RoleName - name of role
 * @param {Object} remainingPolicies - Map of bucket names with the policy document for write access
 */
function addPoliciesToRole(RoleName, remainingPolicies) {
    let policyNames = Object.keys(remainingPolicies);

    if (policyNames.length > 0) {
        return AddInlinePoliciesToIAMRole(RoleName, S3WriteTo.name.replace(/\{TARGET_BUCKET_NAME\}/g, policyNames[0]).replace(/ /g, `_`), remainingPolicies[policyNames[0]])
            .then(() => {
                delete remainingPolicies[policyNames[0]];
            })
            .then(() => addPoliciesToRole(RoleName, remainingPolicies));
    } else
        return Promise.resolve();
}

/**
 * Generate policy documents for each bucket, determine if they already exist, and write the policies that do not to the IAM role
 * @param {String} lambduhRoleName - name of IAM role
 * @param {Array<String>} bucketList - list of buckets found in the app-local configuration
 */
function applyBucketPermissionsForLambduh(lambduhRoleName, bucketList) {
    Trace({ lambduhRoleName, bucketList });

    let bucketsNeeded = {};
    bucketList.forEach(bucket => {
        bucketsNeeded[bucket] = JSON.stringify(S3WriteTo.document)
            .replace(/\{TARGET_BUCKET_NAME\}/g, bucket);
    });

    // Pull the existing permissions for the role, and check for any exact matches on the permission set for each bucket
    return getPoliciesForRole(lambduhRoleName, bucketsNeeded)
        // Add the bucket-specific permission for each bucket to the role
        .then(bucketsRemaining => addPoliciesToRole(lambduhRoleName, bucketsRemaining));

}

/**
 * Add S3 write permissions to an IAM role for buckets in the app-local configuration
 */
function addPermissionsForTask() {
    // Get a usable credentials profile
    return UseProfile(S3Permissions)
        .then(() => {
            // Create the iam object
            iam = new aws.IAM({ apiVersion: `2010-05-08` });
        })
        .then(() => findLambduhConfiguration())
        .then(configuration => extractS3Tasks(configuration))
        .then(buckets => selectIAMRoleUsedByLambduh(buckets))
        .then(bucketsAndRole => applyBucketPermissionsForLambduh(bucketsAndRole.selectedRole, bucketsAndRole.foundBuckets));
}

module.exports.AddS3TaskPermissions = addPermissionsForTask;
