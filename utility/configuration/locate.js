// Node Modules
const path = require(`path`);

// NPM Modules
const fs = require(`fs-extra`),
    { Err } = require(`multi-level-logger`);

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
            Err(err);

            Err(`No lamb-duh.deployment.json file could be found in ${process.cwd()} or in any path above.`);
            Err(`Run "lambduh init" from the root directory of your application.`);

            return null;
        });
}

module.exports.ReadDeploymentConfiguration = readDeploymentConfiguration;
