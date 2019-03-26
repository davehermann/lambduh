# Example Deployment

A deployment example is available in the [Lamb-duh project's ./example directory](https://github.com/davehermann/lambduh/tree/master/example).

:::danger AWS Configuration Required
Before trying this example, make sure you have completed configuring AWS for Lamb-duh, either via the [CLI utility automated method](/CLI.md#initial-aws-configuration-automated) or the [manual method](./ManualConfiguration.md#iam-configuration)
:::

## Whats in the example?

The example contains:
+ A file to deploy to S3 (`./src/frontend/index.html`)
+ A file to deploy as a Lambda function (`./src/backend/functions/hello-world.js`)
+ An incomplete JSON configuration file template (`./src/template.lamb-duh.configuration.json`)
+ A `./createDeployment.js` script that will generate a complete configuration, based on your own S3 bucket and IAM role, and generate a deployable archive `./example.zip`

## Try the example

### Prepare an archive

`cd` to the *./example* directory

```shell
node createDeployment.js
```

+ You will be asked for an S3 bucket where the S3 task will deploy to
    + This is **optional**. If you skip it, the S3 task will be left out of the resulting configuration
    + You will also be asked for a key prefix, if you so choose to include one
+ You will be asked for an IAM role ARN to be used to run a Lambda function

:::tip File Generation
A **lamb-duh.configuration.json** file will be generated, as will an **example.zip** file
:::

+ Review the final `./src/lamb-duh.configuration.json` file to see how its construction relates to the files in `./src`

### Deploy via Lamb-duh

+ Deploy `./example.zip` to see what's creating in S3, Lambda, and API Gateway

:::tip Deployment options
The archive can be deployed by configuring and running the [CLI utility deployment](./CLI.md#application-deployment), or just copying the archive file to the trigger S3 bucket via the AWS Console
:::
