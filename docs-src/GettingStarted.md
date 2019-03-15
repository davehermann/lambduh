# Getting Started

[[toc]]

## 1. Install Lamb-duh locally

```
npm install lambduh -g
```

:::tip
As part of installation, the function code for Lamb-duh's AWS Lambda function will be compressed to (`./Lambda Deployment Package.zip`)
:::

## 2. Configure the AWS environment for Lamb-duh

There are two options for configuration: [manual](./ManualConfiguration.md), or [automated](./CLI.md#initial-aws-configuration-automated) via the CLI utility.

### Manual Process

The manual process will require you to:

1. Create a new role, and add all necessary permissions to it
1. Create a new function in AWS Lambda
    + Upload the `./Lambda Deployment Package.zip` as the code for it
1. Create an S3 bucket to upload your code archives into
1. Add triggers to the bucket for the Lamb-duh process

[See the manual configuration steps here](./ManualConfiguration.md)


### Automated Process

1. Run `lambduh aws-install`, answer a few questions, and let Lamb-duh's CLI utility take care of the setup for you

[Read more about the automated process](./CLI.md#initial-aws-configuration-automated)

## 3. Add a JSON configuration file to an application to be deployed

Application configurations define what is being deployed via 3 basic tasks:
+ S3 tasks - copy source to S3 bucket-key destinations, and set CORS/ETag values accordingly
+ Lambda tasks - Create/Update Lambda functions with new code and/or settings
+ API Gateway tasks - Create/Update API endpoints, create stages, and version Lambda functions to those stages, and create new deployments

See [Lamb-duh Configuration](./LambduhConfiguration.md) for details and the complete set of options.

## 4. Create a compressed archive of the deployment application

This can be done as part of your build process, or manually if you prefer.
Both `.zip` and `.tar.gz` archives are supported.
Copy the archive file to your S3 bucket configured as part of the AWS setup, and watch your application deploy.
