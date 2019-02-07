/**
 * Display help text
 */
function displayHelp() {
    let helpText =
        `\n`
        + `Lamb-duh Serverless Deployment\n`
        + `\n`
        + `Usage: lambduh COMMAND [options]\n`
        + `\n`
        + `Options\n`
        + `-------\n`
        + `    init  Generates a configuration file for deployment by asking a series of questions\n`
        ;

    // eslint-disable-next-line no-console
    console.log(`${helpText}`);

    return Promise.resolve();
}

module.exports.ShowHelp = displayHelp;
