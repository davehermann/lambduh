// Node Modules
const fs = require(`fs`),
    path = require(`path`);

// NPM Modules
const aws = require(`aws-sdk`),
    { Warn } = require(`multi-level-logger`);

// Application Modules
const { RetryOnFailure } = require(`../utilities`);

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
    const lambda = new aws.Lambda({ apiVersion: `2015-03-31` });

    Warn(`Deploying code to Lambda`);

    return new Promise((resolve, reject) => {
        fs.readFile(path.join(__dirname, `../../Lambda Deployment Package.zip`), (err, contents) => {
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

            return RetryOnFailure(lambda, `createFunction`, newLambdaFunction, `IAM replication`, `Lambda function creation`);
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
            const s3 = new aws.S3({ apiVersion: `2006-03-01` });

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

            return RetryOnFailure(s3, `putBucketNotificationConfiguration`, triggerParams, `Lambda function detection`, `Lambda-S3 event trigger connection`);
        })
        .then(() => {
            Warn(`Triggers added`);
        });
}

module.exports.CreateLambdaFunction = createLambdaFunction;
