const { spawn } = require(`child_process`),
    path = require(`path`);

let useDirectory = path.join(__dirname, `src`);

/* eslint-disable no-console */

function spawnProcess(command, parameters, options) {
    return new Promise(resolve => {
        let processHost = spawn(command, parameters, options);
        processHost.stdout.on(`data`, data => {
            console.log(data.toString());
        });
        processHost.stderr.on(`data`, data => {
            console.error(data.toString());
        });
        processHost.on(`close`, () => {
            resolve();
        });
    });
}

function installNpm() {
    console.log(`Installing NPM modules for Lambda deployment package...`);

    return spawnProcess(`npm`, [`install`, `--loglevel`, `error`], { cwd: useDirectory })
        .then(() => {
            console.log(`... NPM install complete`);
        });
}

function buildLambduh() {
    console.log(`Compressing Lamb-duh for deployment to Lambda`);

    return spawnProcess(`node`, [`buildForLambda.js`], { cwd: useDirectory });
}

installNpm()
    .then(() => buildLambduh());
