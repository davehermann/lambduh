// Node Modules
const fs = require(`fs`),
    path = require(`path`);

// NPM Modules
const aws = require(`aws-sdk`),
    { Warn, Err } = require(`multi-level-logger`);

// Application Modules
const { Throttle } = require(`../../src/tasks/apiGateway/throttle`);

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
                Err(`${err.code}: ${err.message}`);

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
                Err(`${err.code}: ${err.message}`);

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

    Warn(`Deploying code to Lambda`);

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

            Warn(`This will retry every 5 seconds, up to 1 minute, due to delays in IAM replication`);

            return retryableLambdaCreation(newLambdaFunction);
        })
        .then(lambdaFunction => {
            Warn(`...Function "${lambdaFunction.FunctionName}" deployed`);

            return lambdaFunction;
        })
        .then(lambdaFunction => {
            Warn(`Adding permission for ${answers.s3TriggerBucket} to invoke ${lambdaFunction.FunctionName}`);

            return addS3InvokeLambdaPermission(lambdaFunction.FunctionArn, `arn:aws:s3:::${answers.s3TriggerBucket}`)
                .then(() => { return lambdaFunction; });
        })
        .then(lambdaFunction => {
            Warn(`Configuring S3 triggers for "${answers.s3TriggerBucket}"`);

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

            Warn(`This will retry every 5 seconds, up to 1 minute, due to delays in Lambda replication`);

            return retryLambdaTriggering(triggerParams);
        })
        .then(() => {
            Warn(`Triggers added`);
        });
}

module.exports.CreateLambdaFunction = createLambdaFunction;
