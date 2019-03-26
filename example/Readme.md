# Example deployment

This is a simple example covering each of the Lamb-duh task types.

**See the [Lamb-duh documentation](https://github.com/davehermann/lambduh) for further details**

## Generate a deployable archive
Run `node createDeployment.js` in this directory.
This will:

1. Ask for an S3 bucket to deploy the `src/frontend/index.html` file to
1. Ask for an IAM Role ARN to run the `src/backend/functions/hello-world.js` function as in Lambda
1. Generate an complete `src/lamb-duh.configuration.json` file using those two values
1. Create an `example.zip` file containing all three files mentioned above

## Deploy the archive

Use the `lambduh` CLI utility to deploy the archive, or manually deploy the archive.
