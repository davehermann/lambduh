// Node Modules
const fs = require(`fs`),
    path = require(`path`);

// NPM Modules
const aws = require(`aws-sdk`),
    { Warn } = require(`multi-level-logger`);

// Application Modules
const { RetryOnFailure, LambduhObjectTag } = require(`../utilities`);

const _functionConfiguration = {
    Handler: `deploy.handler`,
    MemorySize: 2048,
    Timeout: 120,
    Runtime: `nodejs8.10`,
};

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
 * Replace any existing matching event notification, or add if not found, to the S3 configuration array
 * @param {Array} triggerList - List of notifications to add
 * @param {Array} lambdaFunctionConfigurations - The LambdaFunctionConfigurations array from the params object
 */
function addOrReplaceS3Trigger(triggerList, lambdaFunctionConfigurations) {
    triggerList.forEach(newTrigger => {
        let idxTrigger = lambdaFunctionConfigurations.findIndex(trigger => {
            let hasEvent = !!trigger.Events.find(evt => { return evt == newTrigger.Events[0]; });
    
            let matchesFilter = true;
            newTrigger.Filter.Key.FilterRules.forEach(newRule => {
                let findRule = trigger.Filter.Key.FilterRules.find(rule => { return (rule.Name.toLowerCase() == newRule.Name.toLowerCase()) && (rule.Value == newRule.Value); });
                if (!findRule)
                    matchesFilter = false;
            });
    
            return (hasEvent && matchesFilter);
        });
    
        if (idxTrigger >= 0)
            lambdaFunctionConfigurations.splice(idxTrigger, 1, newTrigger);
        else
            lambdaFunctionConfigurations.push(newTrigger);
    });
}

/**
 * Load the "Lambda Deployment Package.zip" file
 */
function loadCodeArchiveFile() {
    return new Promise((resolve, reject) => {
        fs.readFile(path.join(__dirname, `..`, `..`, `Lambda Deployment Package.zip`), (err, contents) => {
            if (!!err)
                reject(err);
            else
                resolve(contents);
        });
    });
}

/**
 * Add the Lamb-duh app to Lambda
 * @param {Object} answers - The responses to configuration questions asked of the user
 * @param {string} role - Role creation data for the IAM role
 */
function createLambdaFunction(answers, role) {
    const lambda = new aws.Lambda({ apiVersion: `2015-03-31` }),
        s3 = new aws.S3({ apiVersion: `2006-03-01` });

    Warn(`Deploying code to Lambda`);

    return loadCodeArchiveFile()
        .then(zipAsBuffer => {
            let newLambdaFunction = {
                Code: { ZipFile: zipAsBuffer },
                FunctionName: answers.lambdaFunctionName,
                Role: role.arn,
            };

            for (let prop in _functionConfiguration)
                newLambdaFunction[prop] = _functionConfiguration[prop];

            return RetryOnFailure(lambda, `createFunction`, newLambdaFunction, `IAM replication`, `Lambda function creation`);
        })
        // Tag the function
        .then(lambdaFunction => {
            let functionTag = {
                Resource: lambdaFunction.FunctionArn,
                Tags: LambduhObjectTag,
            };

            return lambda.tagResource(functionTag).promise()
                .then(() => { return lambdaFunction; });
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

            // Get any existing bucket notifications
            return s3.getBucketNotificationConfiguration({ Bucket: answers.s3TriggerBucket }).promise()
                .then(data => {
                    return { existingNotifications: data, lambdaFunction };
                });
        })
        .then(lambdaConfiguration => {
            // Add triggers for the new function to the bucket
            let { lambdaFunction, existingNotifications } = lambdaConfiguration;

            let triggerParams = {
                    Bucket: answers.s3TriggerBucket,
                    NotificationConfiguration: existingNotifications,
                },
                eventType = `s3:ObjectCreated:*`;

            // Add the GZip trigger
            let triggerList = [
                {
                    Id: `Gzip_Tarball-to-${lambdaFunction.FunctionName}`,
                    LambdaFunctionArn: lambdaFunction.FunctionArn,
                    Events: [eventType],
                    Filter: {
                        Key: {
                            FilterRules: [
                                { Name: `suffix`, Value: `.tar.gz` }
                            ]
                        }
                    }
                },
                {
                    Id: `Zip-to-${lambdaFunction.FunctionName}`,
                    LambdaFunctionArn: lambdaFunction.FunctionArn,
                    Events: [eventType],
                    Filter: {
                        Key: {
                            FilterRules: [
                                { Name: `suffix`, Value: `.zip` }
                            ]
                        }
                    }
                },
                {
                    Id: `Lamb-duh_Continued_Processing-to-${lambdaFunction.FunctionName}`,
                    LambdaFunctionArn: lambdaFunction.FunctionArn,
                    Events: [eventType],
                    Filter: {
                        Key: {
                            FilterRules: [
                                { Name: `suffix`, Value: `.lambduh.txt` }
                            ]
                        }
                    }
                },
            ];

            addOrReplaceS3Trigger(triggerList, triggerParams.NotificationConfiguration.LambdaFunctionConfigurations);

            return RetryOnFailure(s3, `putBucketNotificationConfiguration`, triggerParams, `Lambda function detection`, `Lambda-S3 event trigger connection`);
        })
        .then(() => { Warn(`Triggers added to ${answers.s3TriggerBucket}`); })
        // Tag S3 Bucket
        .then(() => {
            return s3.getBucketTagging({ Bucket: answers.s3TriggerBucket }).promise()
                .catch(err => {
                    if (err.code == `NoSuchTagSet`)
                        return Promise.resolve({ TagSet: [] });

                    throw err;
                })
                .then(data => {
                    let currentTags = data.TagSet;

                    // Only tag with the resource tag as the bucket is not generated here
                    for (let prop in LambduhObjectTag)
                        if (prop.search(/resource/i) >= 0) {
                            let existingTag = currentTags.find(tag => { return (tag.Key == prop); });
                            if (!existingTag) {
                                existingTag = { Key: prop };
                                currentTags.push(existingTag);
                            }

                            existingTag.Value = LambduhObjectTag[prop];
                        }

                    return currentTags;
                })
                .then(TagSet => s3.putBucketTagging({ Bucket: answers.s3TriggerBucket, Tagging: { TagSet } }).promise());
        })
        .then(() => { Warn(`${answers.s3TriggerBucket} tagged`); });
}

module.exports.CreateLambdaFunction = createLambdaFunction;
module.exports.defaultFunctionConfiguration = _functionConfiguration;
module.exports.LoadCodeArchive = loadCodeArchiveFile;
