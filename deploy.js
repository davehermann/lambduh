"use strict";

const path = require(`path`),
    { Initialize } = require(`./initialize`),
    log = require(`./logging`);

global.logLevel = process.env.log || `warn`;

const localRoot = `/tmp/deployment`;
const extractionLocation = `${localRoot}/extract`;

module.exports.lambda = (evtData, context) => {
    log.Trace(evtData, true);
    log.Trace(context, true);

    return startProcessing(evtData, context)
        .catch(err => {
            log.Error(err);

            return Promise.reject(err);
        });
};

function startProcessing(evtData, context) {
    // Determine if the source of the invocation is an archive or a configuration file
    // The source should always be an S3 record as the trigger will be either an archive to deploy, or the configuration file

    if (!evtData || !evtData.Records || !evtData.Records[0] || !evtData.Records[0].s3)
        return Promise.reject(new Error(`Lambduh must be launched via adding an archive to S3`));
    else {
        let s3Source = evtData.Records[0].s3,
            fileName = path.basename(s3Source.object.key);

        if (fileName.search(/^config\..*\.lambduh$/) >= 0)
            return nextProcessStep();
        else
            return Initialize(evtData, context, localRoot, extractionLocation);
    }
}

function nextProcessStep() {
    return Promise.resolve();
}
