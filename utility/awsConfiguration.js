const aws = require(`aws-sdk`),
    fs = require(`fs`),
    inquirer = require(`inquirer`),
    path = require(`path`),
    { PermissionSet, TrustedEntity } = require(`./aws/policyDocuments`),
    { Throttle } = require(`../src/tasks/apiGateway/throttle`);

/**
 * Ask the user for critical details about their configuration
 */
function collectKeyDetails() {
    let questions = [
        {
            name: `credentialsProfile`,
            message: `Specify a profile for your AWS Shared Credentials`,
            default: `default`,
        },
        {
            name: `iamRoleName`,
            message: `New IAM role:`,
            default: `Lamb-duh_Deployment`,
        },
        {
            name: `lambdaFunctionName`,
            message: `Lamb-duh function name in Lambda:`,
            default: (answers) => { return answers.iamRoleName; },
        },
        {
            name: `s3TriggerBucket`,
            message: `Bucket Name:`,
            prefix: `The name of an existing S3 bucket where you will place the compressed file to trigger Lamb-duh\n`,
            validate: (input) => {
                if (input.trim().length == 0)
                    return `S3 Bucket name required`;

                return true;
            },
        },
    ];

    return inquirer.prompt(questions)
        .then(answers => {
            if (answers.credentialsProfile != `default`)
                aws.config.credentials = new aws.SharedIniFileCredentials({ profile: answers.credentialsProfile });

            return answers;
        });
}

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

        // eslint-disable-next-line no-console
        console.log(`Adding permissions for ${policy.name} to "${role.roleName}"`);

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

    // eslint-disable-next-line no-console
    console.log(`Creating new role "${answers.iamRoleName}"`);

    // Create a new role
    const newRoleParams = {
        RoleName: answers.iamRoleName,
        AssumeRolePolicyDocument: JSON.stringify(TrustedEntity.document),
        Description: `Lamb-duh role for deploying applications`,
    };

    return iam.createRole(newRoleParams).promise()
        .then(data => {
            // eslint-disable-next-line no-console
            console.log(`New "${newRoleParams.RoleName}" IAM role created`);

            return { roleName: data.Role.RoleName, arn: data.Role.Arn };
        })
        .then(role => addPermissionsToIAMRole(role, answers, PermissionSet))
        .then(role => Promise.resolve({ answers, role }));
    // Will need all known deploy-into buckets
}

/**
 * Confirm the existence of the S3 triggering bucket before continuing
 * @param {Object} answers - The responses to configuration questions asked of the user
 * @param {Boolean} skipValidation 
 */
function confirmS3Trigger(answers, skipValidation) {
    let s3 = new aws.S3({ apiVersion: `2006-03-01` }),
        pGetBuckets = Promise.resolve();

    if (!skipValidation) {
        // eslint-disable-next-line no-console
        console.log(`\nConfirming S3 bucket "${answers.s3TriggerBucket}" exists...`);
        pGetBuckets = s3.listBuckets().promise();
    }

    return pGetBuckets
        .then(data => {
            let foundBucket = null;

            if (!skipValidation) {
                foundBucket = data.Buckets.find(bucket => { return (bucket.Name == answers.s3TriggerBucket); });

                if (!!foundBucket)
                    return Promise.resolve(answers);
                else
                    // eslint-disable-next-line no-console
                    console.log(`\n...bucket NOT FOUND in S3`);
            }

            if (!foundBucket) {
                // eslint-disable-next-line no-console
                console.log(`-----`),
                // eslint-disable-next-line no-console
                console.log(`This configuration process WILL NOT create the S3 triggering bucket for you.`);
                // eslint-disable-next-line no-console
                console.log(`Please ensure a bucket exists for receiving the compressed deployment packages before continuing.`);
                // eslint-disable-next-line no-console
                console.log(`-----`);

                let questions = [
                    {
                        type: `list`,
                        name: `bucketConfirmation`,
                        message: `Confirm when the bucket exists to continue:`,
                        choices: [`Yes`, `No`],
                        default: `No`,
                    }
                ];

                return inquirer.prompt(questions)
                    .then(confirmed => confirmS3Trigger(answers, (confirmed.bucketConfirmation == `No`)));
            }
        })
        .then(answers => {
            // eslint-disable-next-line no-console
            console.log(`...Bucket found in S3`);

            // Query the region
            return s3.getBucketLocation({ Bucket: answers.s3TriggerBucket }).promise()
                .then(data => {
                    // Update the configuration to use the region detected (default to N. Virginia for an empty string)
                    aws.config.update({ region: data.LocationConstraint || `us-east-1` });

                    // eslint-disable-next-line no-console
                    console.log(`Configured to use S3 region of ${data.LocationConstraint || `us-east-1`}`);

                    return answers;
                });
        });
}

/**
 * (Re)try creating the Lambda function while waiting for IAM to replicate the role
 * @param {Object} configuration - The params object for lambda.createFunction()
 * @param {Number | undefined} retryCount - Track the number of retries
 * @param {Object | undefined} creationData - The function creation data after successful completion
 */
function retryableLambdaCreation(configuration, retryCount, creationData) {
    const lambda = new aws.Lambda({ apiVersion: `2015-03-31` });

    if (retryCount === undefined)
        retryCount = 0;

    if ((retryCount < 12) && !creationData) {
        return lambda.createFunction(configuration).promise()
            .then(data => {
                return retryableLambdaCreation(null, 100, data);
            })
            .catch(err => {
                // Increment the retry count
                retryCount++;

                // Note the error
                // eslint-disable-next-line no-console
                console.error(`${err.code}: ${err.message}`);

                return Throttle(null, 5000)
                    .then(() => retryableLambdaCreation(configuration, retryCount));
            });
    } else {
        if (!!creationData)
            return Promise.resolve(creationData);

        throw `Cannot complete Lambda function creation`;
    }
}

/**
 * (Re)try the addition of notification events for triggering Lambda from S3
 * @param {Object} triggerParams - The params object for s3.putBucketNotificationConfiguration
 * @param {Number | undefined} retryCount - Track the number of retries
 * @param {Object | undefined} creationData - The function creation data after successful completion
 */
function retryLambdaTriggering(triggerParams, retryCount, creationData) {
    const s3 = new aws.S3({ apiVersion: `2006-03-01` });

    if (retryCount === undefined)
        retryCount = 0;

    if ((retryCount < 12) && !creationData) {
        return s3.putBucketNotificationConfiguration(triggerParams).promise()
            .then(data => retryLambdaTriggering(null, 100, data))
            .catch(err => {
                // Increment the retry count
                retryCount++;

                // Note the error
                // eslint-disable-next-line no-console
                console.error(`${err.code}: ${err.message}`);

                return Throttle(null, 5000)
                    .then(() => retryLambdaTriggering(triggerParams, retryCount));
            });
    } else {
        if (!!creationData)
            return Promise.resolve(creationData);

        throw `Cannot complete Lambda-S3 event trigger connection`;
    }
}

/**
 * Add an invoke permission to a Lambda function from an S3 bucket
 * @param {String} FunctionName - Name/ARN of the function
 * @param {String} SourceArn - ARN of the resource
 */
function addS3InvokeLambdaPermission(FunctionName, SourceArn) {
    const lambda = new aws.Lambda({ apiVersion: `2015-03-31` });

    const newPermission = {
        Action: `lambda:InvokeFunction`,
        FunctionName,
        Principal: `s3.amazonaws.com`,
        StatementId: `S3-Invoke-Trigger`,
        SourceArn,
    };

    return lambda.addPermission(newPermission).promise();
}

/**
 * Add the Lamb-duh app to Lambda
 * @param {Object} answers - The responses to configuration questions asked of the user
 * @param {string} role - Role creation data for the IAM role
 */
function createLambdaFunction(answers, role) {

    // eslint-disable-next-line no-console
    console.log(`Deploying code to Lambda`);

    return new Promise((resolve, reject) => {
        fs.readFile(path.join(__dirname, `../Lambda Deployment Package.zip`), (err, contents) => {
            if (!!err)
                reject(err);
            else
                resolve(contents);
        });
    })
        .then(zipAsBuffer => {
            let newLambdaFunction = {
                Code: { ZipFile: zipAsBuffer },
                FunctionName: answers.lambdaFunctionName,
                Role: role.arn,
                Handler: `deploy.lambda`,
                MemorySize: 2048,
                Timeout: 120,
                Runtime: `nodejs8.10`,
            };

            // eslint-disable-next-line no-console
            console.log(`This will retry every 5 seconds, up to 1 minute, due to delays in IAM replication`);

            return retryableLambdaCreation(newLambdaFunction);
        })
        .then(lambdaFunction => {
            // eslint-disable-next-line no-console
            console.log(`...Function "${lambdaFunction.FunctionName}" deployed`);

            return lambdaFunction;
        })
        .then(lambdaFunction => {
            // eslint-disable-next-line no-console
            console.log(`Adding permission for ${answers.s3TriggerBucket} to invoke ${lambdaFunction.FunctionName}`);

            return addS3InvokeLambdaPermission(lambdaFunction.FunctionArn, `arn:aws:s3:::${answers.s3TriggerBucket}`)
                .then(() => { return lambdaFunction; });
        })
        .then(lambdaFunction => {
            // eslint-disable-next-line no-console
            console.log(`Configuring S3 triggers for "${answers.s3TriggerBucket}"`);

            let triggerParams = {
                Bucket: answers.s3TriggerBucket,
                NotificationConfiguration: {
                    LambdaFunctionConfigurations: [
                        {
                            LambdaFunctionArn: lambdaFunction.FunctionArn,
                            Events: [`s3:ObjectCreated:*`],
                            Filter: {
                                Key: {
                                    FilterRules: [
                                        { Name: `suffix`, Value: `.tar.gz` }
                                    ]
                                }
                            }
                        },
                        {
                            LambdaFunctionArn: lambdaFunction.FunctionArn,
                            Events: [`s3:ObjectCreated:*`],
                            Filter: {
                                Key: {
                                    FilterRules: [
                                        { Name: `suffix`, Value: `.zip` }
                                    ]
                                }
                            }
                        },
                        {
                            LambdaFunctionArn: lambdaFunction.FunctionArn,
                            Events: [`s3:ObjectCreated:*`],
                            Filter: {
                                Key: {
                                    FilterRules: [
                                        { Name: `suffix`, Value: `.lambduh.txt` }
                                    ]
                                }
                            }
                        },
                    ]
                }
            };

            // eslint-disable-next-line no-console
            console.log(`This will retry every 5 seconds, up to 1 minute, due to delays in Lambda replication`);

            return retryLambdaTriggering(triggerParams);
        })
        .then(() => {
            // eslint-disable-next-line no-console
            console.log(`Triggers added`);
        });
}

/**
 * Completely configure AWS for usage of Lamb-duh
 */
function configureAWS() {
    // eslint-disable-next-line no-console
    console.log(`The configuration process requires an IAM credential with the following permissions:`);
    // eslint-disable-next-line no-console
    console.log(`    - iam:CreateRole`);
    // eslint-disable-next-line no-console
    console.log(`    - iam:PassRole`);
    // eslint-disable-next-line no-console
    console.log(`    - iam:PutRolePolicy`);
    // eslint-disable-next-line no-console
    console.log(`    - lambda:AddPermission`);
    // eslint-disable-next-line no-console
    console.log(`    - lambda:CreateFunction`);
    // eslint-disable-next-line no-console
    console.log(`    - s3:GetBucketLocation`);
    // eslint-disable-next-line no-console
    console.log(`    - s3:ListAllMyBuckets`);
    // eslint-disable-next-line no-console
    console.log(`    - s3:PutBucketNotification`);
    // eslint-disable-next-line no-console
    console.log();

    return collectKeyDetails()
        .then(answers => confirmS3Trigger(answers))
        .then(answers => addRoleToIAM(answers))
        .then(data => createLambdaFunction(data.answers, data.role))
        .catch(err => {
            // eslint-disable-next-line no-console
            console.error(err);
            // eslint-disable-next-line no-console
            console.log(`\nlambduh aws-install could not be completed at this time.`);
        });
}

module.exports.ConfigureAWS = configureAWS;
