const aws = require(`aws-sdk`),
    fs = require(`fs-extra`),
    mime = require(`mime-types`),
    path = require(`path`);

/**
 * Find the utility configuration file anywhere up the current path
 * @param {string | Array} remainingLocations 
 */
function locateConfigurationFile(remainingLocations) {
    if (typeof remainingLocations == `string`)
        remainingLocations = remainingLocations.split(path.sep);

    if (remainingLocations.length > 0) {
        return fs.readFile(path.join(remainingLocations.join(path.sep), `lamb-duh.deployment.json`))
            .then(contents => {
                return Promise.resolve({ contents, remainingLocations });
            })
            // eslint-disable-next-line no-unused-vars
            .catch(err => {
                // Try the directory above
                remainingLocations.pop();
                return locateConfigurationFile(remainingLocations);
            });
    } else
        throw `No file found`;
}

/**
 * Read the configuration file specifying source and destination for deployment
 */
function readDeploymentConfiguration() {
    return locateConfigurationFile(process.cwd())
        .then(foundFile => {
            let { contents, remainingLocations } = foundFile,
                config = JSON.parse(contents);

            // Turn the local file path into an absolute path
            config.localFile = path.join(remainingLocations.join(path.sep), config.localFile);

            return config;
        })
        // eslint-disable-next-line no-unused-vars
        .catch(err => {
            // eslint-disable-next-line no-console
            console.error(err);

            // eslint-disable-next-line no-console
            console.error(`No lamb-duh.deployment.json file could be found in ${process.cwd()} or in any path above.`);
            // eslint-disable-next-line no-console
            console.error(`Run "lambduh init" from the root directory of your application.`);

            return null;
        });
}

function sendToS3(config) {
    if (!!config.credentialsProfile)
        process.env.AWS_PROFILE = config.credentialsProfile;

    let mimeType = mime.lookup(path.extname(config.s3Key)),
        s3 = new aws.S3({ apiVersion: `2006-03-01` }),
        params = {
            Bucket: config.s3Bucket,
            Key: config.s3Key,
            // Use a readable stream to load the file
            Body: fs.createReadStream(config.localFile),
            ContentType: mimeType,
        };

    // eslint-disable-next-line no-console
    console.log(`Uploading to S3...`);

    // Upload the stream
    return new Promise((resolve, reject) => {
        let uploader = s3.upload(params, (err, data) => {
            if (!!err)
                reject(err);
            else
                resolve(data);
        });

        uploader.on(`httpUploadProgress`, (progress) => {
            // eslint-disable-next-line no-console
            console.log(`...${(100 * progress.loaded / progress.total).toFixed(2)}%`);
        });
    })
        .then(data => {
            // eslint-disable-next-line no-console
            console.log(`... upload complete to ${data.Bucket}/${data.Key} (ETag: ${data.ETag})`);
        });
}

/**
 * Copy the source compressed package to the destination S3 bucket
 */
function deployPackage() {
    return readDeploymentConfiguration()
        .then(config => {
            if (!!config)
                return sendToS3(config);
        });
}

module.exports.DeployPackage = deployPackage;
