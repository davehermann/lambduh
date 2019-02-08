/**
 * Display help text
 */
function displayHelp() {
    let helpText =
        `--- Help ---\n`
        + `\n`
        + `Usage: lambduh COMMAND [options]\n`
        + `\n`
        + `Commands\n`
        + `--------\n`
        + `    init    Generates a configuration file for deployment by asking a series of questions\n`
        + `    deploy  Copy compressed source file to destination S3 bucket`
        ;

    // eslint-disable-next-line no-console
    console.log(`${helpText}`);

    return Promise.resolve();
}

module.exports.ShowHelp = displayHelp;
