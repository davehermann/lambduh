# Lamb-duh CLI Application

The CLI application, `lamb-duh`, can be used to initially configure Lamb-duh within AWS, as well as work with configuring and deploying applications.

Each command will walk through its process as noted.

[[toc]]

## AWS Credentials

The Lamb-duh CLI expects proper configuration of AWS shared credentials.
The CLI interface will ask for, and when necessary will store, the profile name if you use a shared credentials file with multiple profiles.
If you have only the default profile, prefer to select a profile via environment variables, or do not use a shared credentials file: **leave the profile as "default" when asked by the CLI**

The Lamb-duh CLI will note what IAM policy permissions it needs to perform its tasks when it starts, and can also supply a JSON policy document.

## Initial AWS Configuration: Automated

+ Create a new IAM role, and all needed permissions, for Lamb-duh to deploy applications properly
+ Install Lamb-duh code as a function in AWS Lambda
+ Configure triggers on an S3 bucket

```
lamb-duh aws-install
```

### Prerequisite: S3 Bucket

Before running, you will need to have an S3 bucket where an application compressed file will be uploaded to start the deployment processing.
You can use an existing bucket, or create a new one.
Lamb-duh will install to the same region where the bucket exists.

### Running
The process will ask for you to name the IAM role, and Lambda function, which will be created, and ask for you to select the trigger bucket from your account's list of S3 buckets.

## Application Deployment

Lamb-duh can upload your archive to your S3 triggering bucket for you with a single command, `lamb-duh deploy`.

:::warning Configuration
To deploy an application, a configuration file must exist at the root of the archive bundle.
See [Lamb-duh configuration](./LambduhConfiguration.md) for details.
:::

### Add a deploy configuration

+ Client-side configuration used for running the `lamb-duh deploy` command.

```
lamb-duh deploy-init
```

Creates a deploy configuration at the current directory in `lamb-duh.deployment.json`.
The file contains:
+ Relative path to the compressed archive for deployment
+ Bucket for deployment
+ Key for the file
+ Relative path to the Lamb-duh configuration JSON file in source

### Allow S3 Deployment Tasks

+ Ensure the role used for Lamb-duh has permission to write to all buckets included in the application's Lamb-duh configuration

```
lamb-duh deploy-s3-permissions
```

Scans the Lamb-duh configuration JSON for any S3 tasks, and adds any missing permissions to an IAM role.

This can also be [configured manually](./ManualConfiguration.html#additional-policy-needed-for-each-s3-bucket-manipulated-by-a-deployment).

### Deploy to Server

```
lamb-duh deploy
```

Uses `lamb-duh.deployment.json` to upload the compressed archive file, and trigger the Lamb-duh deployment process in AWS.
