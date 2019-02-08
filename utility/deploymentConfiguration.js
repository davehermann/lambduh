const fs = require(`fs-extra`),
    inquirer = require(`inquirer`),
    path = require(`path`);

const _configFilePath = path.join(process.cwd(), `lamb-duh.deployment.json`);

/**
 * Read an already existing configuration to use as defaults
 */
function loadExistingFile() {
    return fs.readFile(_configFilePath)
        .then(contents => {
            // eslint-disable-next-line no-console
            console.log(`Existing configuration found.\nUsing existing values for defaults.\n`);
            return JSON.parse(contents);
        })
        .catch(err => {
            // On any error, assume the file either doesn't exist or can't be read
            return {};
        });
}

/**
 * As the user for configuration information
 * @param {Object} valueDefaults - Default values from a prior config generation
 */
function queryUser(valueDefaults) {
    let { localFile, s3Bucket, s3Key, credentialsProfile } = valueDefaults;

    const questions = [
        {
            name: `localFile`,
            message: `Path to local deployment file:`,
            default: localFile,
        },
        {
            name: `s3Bucket`,
            message: `Bucket name in S3:`,
            default: s3Bucket,
        },
        {
            name: `s3Key`,
            message: `Object key in S3:`,
            default: (answers) => {
                return s3Key || path.basename(answers.localFile);
            },
        },
        {
            name: `credentialsProfile`,
            message: `If you need to use a named profile, enter it here:`,
            default: credentialsProfile || `default`,
            prefix: `\nLamb-duh uses AWS Shared Credentials for permissions.\nThe IAM credential will need 'PutObject' permissions for the destination bucket.\nSearch for "AWS Shared Credentials" for more information.\n`,
        },
    ];

    return inquirer
        .prompt(questions)
        .then(answers => {
            if (answers.credentialsProfile == `default`)
                delete answers.credentialsProfile;

            return answers;
        });
}

/**
 * Generate a deployment JSON file that will send a local compressed source to a remote AWS S3 bucket
 */
function createConfiguration() {
    return loadExistingFile()
        .then(existingConfiguration => queryUser(existingConfiguration))
        .then(answers => generateConfigurationFile(answers));
}

/**
 * Generate a JSON configuration file
 * @param {Object} answers - the answer object generated by inquirer.js 
 */
function generateConfigurationFile(answers) {
    // Write the file
    return fs.writeFile(_configFilePath, JSON.stringify(answers, null, 4));
}

module.exports.CreateDeploymentConfiguration = createConfiguration;
