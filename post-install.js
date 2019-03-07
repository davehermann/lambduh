// Node Modules
const { spawn } = require(`child_process`),
    path = require(`path`);

// NPM Modules
const { IncludeTimestamp, Warn, Err } = require(`multi-level-logger`);

const _useDirectory = path.join(__dirname, `src`);

IncludeTimestamp(false);

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

    return spawnProcess(`npm`, [`install`, `--loglevel`, `error`], { cwd: _useDirectory })
        .then(() => {
            Warn(`... NPM install complete`);
        });
}

function buildLambduh() {
    Warn(`Compressing Lamb-duh for deployment to Lambda`);

    return spawnProcess(`node`, [`buildForLambda.js`], { cwd: _useDirectory });
}

installNpm()
    .then(() => buildLambduh());
