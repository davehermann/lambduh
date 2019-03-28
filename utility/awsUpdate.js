// Node Modules
const { spawn } = require(`child_process`),
    path = require(`path`);

// NPM Modules
const aws = require(`aws-sdk`),
    inquirer = require(`inquirer`),
    { Warn } = require(`multi-level-logger`);

// Application Modules
const { BuildLambduh } = require(`./utilities`),
    { defaultFunctionConfiguration, LoadCodeArchive } = require(`./aws/createFunction`),
    { ConfiguratorUpdate } = require(`./aws/policyDocuments`),
    { UseProfile } = require(`./configuration/credentials`);

let lambda, resourceGroupsTaggingApi;

function redeployToLambda(functionArn) {
    // Get the existing function
    return lambda.getFunctionConfiguration({ FunctionName: functionArn }).promise()
        .then(existingConfiguration => {
            // Update the handler, and runtime to match current requirements
            let functionConfiguration = {
                FunctionName: existingConfiguration.FunctionArn,
                Handler: defaultFunctionConfiguration.Handler,
                Runtime: defaultFunctionConfiguration.Runtime,
            };

            return lambda.updateFunctionConfiguration(functionConfiguration).promise();
        })
        .then(() => LoadCodeArchive())
        // Update the code
        .then(ZipFile => lambda.updateFunctionCode({ FunctionName: functionArn, ZipFile }).promise());
}

function rebuildSource() {
    return BuildLambduh();
}

function enterFunctionArn() {
    Warn(`A single existing function in the region could not be automatically detected.`);

    let questions = [
        {
            name: `functionArn`,
            message: `Complete ARN of function to update:`,
        },
    ];
    return inquirer.prompt(questions)
        .then(answers => {
            return answers.functionArn;
        });
}

function findExistingFunction(foundResources, PaginationToken) {
    if (!foundResources || !!PaginationToken) {
        if (!foundResources)
            foundResources = [];

        let filter = {
            PaginationToken,
            ResourcesPerPage: 1,
            TagFilters: [
                { Key: `Lamb-duh Resource`, Values: [`true`] }
            ]
        };
    
        return resourceGroupsTaggingApi.getResources(filter).promise()
            .then(data => {
                foundResources = foundResources.concat(data.ResourceTagMappingList);

                return data.PaginationToken;
            })
            .then(nextToken => findExistingFunction(foundResources, nextToken));
    } else {
        // Find a single Lamba function
        let lambdaFunctions = foundResources.filter(resource => { return resource.ResourceARN.search(/^arn:aws:lambda/) == 0; });

        if (lambdaFunctions.length == 1)
            return Promise.resolve(lambdaFunctions[0].ResourceARN);
        else
            return enterFunctionArn();
    }
}

function setAwsRegion() {
    Warn(`Which AWS region hosts your Lamb-duh deployment to be updated?`);
    let questions = [
        {
            name: `region`,
            message: `AWS region string`,
            default: `us-east-1`,
        },
    ];

    return inquirer.prompt(questions)
        .then(answers => {
            aws.config.update({ region: answers.region });
        });
}

function updateAWS() {
    return UseProfile(ConfiguratorUpdate)
        .then(() => setAwsRegion())
        .then(() => {
            lambda = new aws.Lambda({ apiVersion: `2015-03-31` });
            resourceGroupsTaggingApi = new aws.ResourceGroupsTaggingAPI({ apiVersion: `2017-01-26` });
        })
        .then(() => findExistingFunction())
        .then(functionArn => {
            return rebuildSource()
                .then(() => { return functionArn; });
        })
        .then(functionArn => redeployToLambda(functionArn))
        .then(() => {
            Warn(`The function has been updated`);
        });
}

module.exports.UpdateAWS = updateAWS;
