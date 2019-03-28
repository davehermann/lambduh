// Node Modules
const { spawn } = require(`child_process`),
    path = require(`path`);

// NPM Modules
const { Warn, Err } = require(`multi-level-logger`);

// Application Modules
const { Throttle } = require(`../src/tasks/apiGateway/throttle`);

const _applicationDirectory = path.join(__dirname, `..`, `src`);

/**
 * @constant
 * @type {Object}
 * @default
 */
const tagForAllObjects = {
    [`Lamb-duh Resource`]: `true`,
    [`Lamb-duh Generated`]: `true`,
};

/**
 * (Re)try AWS action in case of failure due to not-yet-completed replication
 * @param {Function} retryFunction - The AWS function to run 
 * @param {Object} configuration - The params object to pass to the AWS function
 * @param {String} reason - The reason for needed to retry the function
 * @param {String} failureMessage - Notation of what has failed, if the function does not complete once
 * @param {Number} [retryInterval=5] - Time (in seconds) between each retry
 * @param {Number} [maxRetries=10] - The maximum number of times to retry the function
 * @param {Number} [retryCount] - Tracks the number of retries
 * @param {Object} [creationData] - The function creation data after successful completion
 */
function retryable(awsScope, method, configuration, reason, failureMessage, retryInterval = 5, maxRetries = 10, retryCount, creationData) {
    if (retryCount === undefined) {
        retryCount = 0;

        Warn(`This will retry every ${retryInterval} seconds, up to ${maxRetries} times, due to delays in ${reason}`);
    }

    if ((retryCount < maxRetries) && !creationData) {
        return awsScope[method](configuration).promise()
            .then(data => {
                return retryable(awsScope, method, configuration, reason, failureMessage, retryInterval, maxRetries, maxRetries + 1, data);
            })
            .catch(err => {
                // Increment the retry count
                retryCount++;

                // Note the error
                Err(`${err.code}: ${err.message}`);

                return Throttle(null, retryInterval * 1000)
                    .then(() => retryable(awsScope, method, configuration, reason, failureMessage, retryInterval, maxRetries, retryCount));
            });
    } else {
        if (!!creationData)
            return Promise.resolve(creationData);

        throw `Cannot complete ${failureMessage}`;
    }
}

function spawnProcess(command, parameters, options) {
    return new Promise(resolve => {
        let processHost = spawn(command, parameters, options);
        processHost.stdout.on(`data`, data => {
            Warn(data.toString());
        });
        processHost.stderr.on(`data`, data => {
            Err(data.toString());
        });
        processHost.on(`close`, () => {
            resolve();
        });
    });
}

function installNpm() {
    Warn(`Installing NPM modules for Lambda deployment package...`);

    return spawnProcess(`npm`, [`install`, `--loglevel`, `error`], { cwd: _applicationDirectory })
        .then(() => {
            Warn(`... NPM install complete`);
        });
}

function buildLambduh() {
    Warn(`Compressing Lamb-duh for deployment to Lambda`);

    return spawnProcess(`node`, [`buildForLambda.js`], { cwd: _applicationDirectory });
}

module.exports.RetryOnFailure = retryable;
module.exports.LambduhObjectTag = tagForAllObjects;
module.exports.InstallNPM = installNpm;
module.exports.BuildLambduh = buildLambduh;
