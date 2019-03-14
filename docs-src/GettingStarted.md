# Getting Started

## Install the application

```
npm install lambduh -g
```

+ A `postinstall` task will trigger to complete dependency installation and generate a zip archive (`./Lambda Deployment Package.zip`) of the Lamb-duh code to run as an AWS Lambda function

## Configure the AWS environment for Lamb-duh

There are two options for configuration: [manual](./ManualConfiguration.md), or [automated](./CLI.md#initial-aws-configuration-automated) via the CLI.

### [Manual Process](./ManualConfiguration.md)
1. Create a new role, and add all necessary permissions to it
1. Create a new function in AWS Lambda
    + Upload the `./Lambda Deployment Package.zip` as the code for it
1. Create an S3 bucket to upload your code archives into
1. Add triggers to the bucket for the Lamb-duh process

### [Automated Process](./CLI.md#initial-aws-configuration-automated)
1. Run `lambduh aws-install`, answer a few questions, and let Lamb-duh take care of the setup for you

## Add a JSON configuration file to the application to be deployed

Configurations define 3 basic tasks:
+ S3 tasks - copy source to S3 bucket/key destinations, and set CORS/ETag values accordingly
+ Lambda tasks - Create/Update Lambda functions with new code/settings
+ API Gateway tasks - Create/Update API endpoints, create stages - and version Lambda functions to those stages, and create new deployments

See [Lamb-duh Configuration](./LambduhConfiguration.md) for details and the complete set of options.

## Create a compressed archive of the application

This can be done as part of the build process, or manually if you prefer.
Both `.zip` and `.tar.gz` archives are supported.
