// Node Modules
const { spawn } = require(`child_process`),
    path = require(`path`);

// NPM Modules
const { IncludeTimestamp, Warn, Err } = require(`multi-level-logger`);

// Application Modules
const { BuildLambduh, InstallNPM } = require(`./utility/utilities`);

IncludeTimestamp(false);

installNpm()
    .then(() => buildLambduh());
