"use strict";

const { Trace, Error } = require(`./logging`);

global.logLevel = process.env.log || `warn`;

const localRoot = `/tmp/deployment`;
const extractionLocation = `${localRoot}/extract`;

module.exports.lambda = function(evtData, context, callback) {
    Trace(evtData, true);

    Promise.resolve()
        .then(() => { callback(); })
        .catch(err => {
            Error(err);

            callback(err);
        });
};
