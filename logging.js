"use strict";

const levels = Object.freeze({
    dev: 0,
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60
});

function writeLog(data, asJSON, level) {
    let existingLevel = global.logLevel,
        currentLevel = levels[existingLevel.toLowerCase()];
    level = levels[level.toLowerCase()];

    if (level >= currentLevel)
        console.log(asJSON ? JSON.stringify(data) : data);
}

module.exports.Log = writeLog;

module.exports.Dev = (data, asJSON) => {
    writeLog(data, asJSON, `Dev`);
};

module.exports.Trace = (data, asJSON) => {
    writeLog(data, asJSON, `Trace`);
};

module.exports.Debug = (data, asJSON) => {
    writeLog(data, asJSON, `Debug`);
};

module.exports.Info = (data, asJSON) => {
    writeLog(data, asJSON, `Info`);
};

module.exports.Warn = (data, asJSON) => {
    writeLog(data, asJSON, `Warn`);
};

module.exports.Error = (data, asJSON) => {
    writeLog(data, asJSON, `Error`);
};

module.exports.Fatal = (data, asJSON) => {
    writeLog(data, asJSON, `Fatal`);
};
