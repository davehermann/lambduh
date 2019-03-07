// Node Modules
const path = require(`path`);

// NPM Modules
const aws = require(`aws-sdk`),
    fs = require(`fs-extra`),
    mime = require(`mime-types`),
    { Warn, Err } = require(`multi-level-logger`);

// Application Modules
const { ReadDeploymentConfiguration } = require(`./configuration/locate`);

function sendToS3(config) {
    if (!!config.credentialsProfile)
        aws.config.credentials = new aws.SharedIniFileCredentials({ profile: config.credentialsProfile });

    let mimeType = mime.lookup(path.extname(config.s3Key)),
        s3 = new aws.S3({ apiVersion: `2006-03-01` }),
        params = {
            Bucket: config.s3Bucket,
            Key: config.s3Key,
            // Use a readable stream to load the file
            Body: fs.createReadStream(config.localFile),
            ContentType: mimeType,
        };

    Warn(`Uploading to S3...`);

    // Upload the stream
    return new Promise((resolve, reject) => {
        let uploader = s3.upload(params, (err, data) => {
            if (!!err)
                reject(err);
            else
                resolve(data);
        });

        uploader.on(`httpUploadProgress`, (progress) => {
            Warn(`...${(100 * progress.loaded / progress.total).toFixed(2)}%`);
        });
    })
        .then(data => {
            Warn(`... upload complete to ${data.Bucket}/${data.Key} (ETag: ${data.ETag})`);
        });
}

/**
 * Copy the source compressed package to the destination S3 bucket
 */
function deployPackage() {
    return ReadDeploymentConfiguration()
        .then(config => {
            if (!!config)
                return sendToS3(config);
        });
}

module.exports.DeployPackage = deployPackage;
