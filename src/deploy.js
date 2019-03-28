"use strict";

const path = require(`path`),
    { Initialize } = require(`./initialize`),
    log = require(`./logging`),
    { ErrorNotification } = require(`./notifications`),
    { NextSteps } = require(`./tasks/processRemainingTasks`);

global.logLevel = process.env.log || `warn`;

const localRoot = path.join(`/tmp`, `deployment`);
const extractionLocation = path.join(localRoot, `extract`);

module.exports.handler = (evtData, context) => {
    log.Trace(evtData, true);
    log.Trace(context, true);

    return startProcessing(evtData, context)
        .catch(err => {
            log.Error(err);

            return ErrorNotification(err)
                .then(() => Promise.reject(err));
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

        if (fileName.search(/\.lambduh\.txt$/) >= 0)
            return NextSteps(evtData, localRoot);
        else {
            // Ignore archive creation (S3 copy action + archive subpath)
            if ((evtData.Records[0].eventName.search(/copy/i) >= 0) && (s3Source.object.key.search(/Lamb-duh\_archive\//i) >= 0)) {
                log.Debug(`Historical archive creation detected; ignoring file.`);
                return Promise.resolve();
            } else
                return Initialize(evtData, context, localRoot, extractionLocation);
        }
    }
}
