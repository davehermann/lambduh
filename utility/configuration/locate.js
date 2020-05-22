// Node Modules
const fs = require(`fs`),
    path = require(`path`);

// NPM Modules
const { Err } = require(`multi-level-logger`);

/**
 * Find the utility configuration file anywhere up the current path
 * @param {string | Array} remainingLocations
 */
function locateConfigurationFile(remainingLocations) {
    if (typeof remainingLocations == `string`)
        remainingLocations = remainingLocations.split(path.sep);

    if (remainingLocations.length > 0) {
        return fs.promises.readFile(path.join(remainingLocations.join(path.sep), `lamb-duh.deployment.json`))
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

            // Relative file paths in the configuration should be converted to absolute from the application root
            const applicationRoot = remainingLocations.join(path.sep);

            // Compressed deployment file
            config.localFile = path.join(applicationRoot, config.localFile);
            // Source for Lamb-duh processing
            config.lambduhConfigurationFile = path.join(applicationRoot, config.lambduhConfigurationFile);

            return config;
        })
        // eslint-disable-next-line no-unused-vars
        .catch(err => {
            Err(err);

            Err(`No lamb-duh.deployment.json file could be found in ${process.cwd()} or in any path above.`);
            Err(`Run "lamb-duh init" from the root directory of your application.`);

            return null;
        });
}

module.exports.ReadDeploymentConfiguration = readDeploymentConfiguration;
