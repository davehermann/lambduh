let config = {
    title: `Lamb-duh`,
    description: `Stupid name. Stupidly simple serverless deployment to AWS.`,
    dest: `./docs/`,
    themeConfig: {
        sidebar: [
            `/`,
            `/GettingStarted`,
            `/ManualConfiguration`,
            `/LambdaEnvironment`,
            `/LambduhConfiguration`,
            `/CLI`,
            `/UpgradeToV2`,
        ],
    },
    markdown: {
        toc: {
            includeLevel: [2, 3, 4],
        },
    },
};

// On Github, the base is required
// Turn it off if an environment variable is set
if (!process.env.DEV || (process.env.DEV !== `true`))
    config.base = `/lambduh/`;

module.exports = config;
