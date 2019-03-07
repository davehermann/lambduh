// NPM Modules
const aws = require(`aws-sdk`),
    inquirer = require(`inquirer`),
    { Warn } = require(`multi-level-logger`);

/**
 * Get all buckets the credentials can see
 */
function listAllBuckets() {
    const s3 = new aws.S3({ apiVersion: `2006-03-01` });

    return s3.listBuckets().promise()
        .then(data => { return data.Buckets.map(bucket => { return bucket.Name; }); });
}

/**
 * Retrieve the region for the selected bucket, and assign as the region for all actions
 * @param {Object} answers - The responses to configuration questions asked of the user
 */
function getBucketRegion(answers) {
    const s3 = new aws.S3({ apiVersion: `2006-03-01` });

    // Query the region
    return s3.getBucketLocation({ Bucket: answers.s3TriggerBucket }).promise()
        .then(data => {
            // Update the configuration to use the region detected (default to N. Virginia for an empty string)
            aws.config.update({ region: data.LocationConstraint || `us-east-1` });

            Warn(`Configured to use S3 region of ${data.LocationConstraint || `us-east-1`}`);

            return answers;
        });
}

/**
 * Select the S3 triggering bucket from the list of available buckets
 * @param {Object} originalAnswers - The responses to configuration questions asked of the user
 */
function selectBucket(originalAnswers) {
    return listAllBuckets()
        .then(bucketNames => {
            bucketNames.sort();

            let questions = [
                {
                    type: `list`,
                    name: `selectedBucket`,
                    message: `Your S3 Buckets:`,
                    prefix: `The name of an existing S3 bucket where you will place the compressed file to trigger Lamb-duh\n`,
                    choices: bucketNames,
                }
            ];

            return inquirer.prompt(questions);
        })
        .then(answers => {
            originalAnswers.s3TriggerBucket = answers.selectedBucket;

            return getBucketRegion(originalAnswers);
        });
}

module.exports.GetS3TriggerBucket = selectBucket;
