# Lamb-duh
#### Stupid name. Stupidly simple serverless deployment to AWS.

## TL;DR?

1. Write your application using any directory structure that works for you
    + All of your AWS Lambda functions must use **relative** paths for modules (and their modules need relative paths)
1. Include a configuration JSON file in the root of your application
    + Defines the S3, Lambda, and/or API Gateway steps
1. Archive the entire application
    + .zip, .tar, and .tar.gz all supported!
1. Drop your archive file in an S3 bucket
1. Profit!

## v1 to v2
#### Major Changes
+ Complete, from-scratch rewrite of the codebase
+ **Lamb-duh** leverages AWS services even more to boost efficiency
+ Large deployments are considerably faster
+ Deployments are now versioned (**off by default**), which allows for <u>not</u> breaking browser applications that may be cached.
    + S3 deployments can have the endpoint string automatically updated
    + For local testing/manual updates: following deployment the log will contain the correct endpoint, and using the SNS notification will supply it via SNS.
    + The number of saved aliases can be controlled, both as total numbers and amount of time
    + See below for more details and how to turn the feature off
+ Start/Completion notifications now provided (via SNS)

#### Breaking Changes
While v2.0.0 represents a total rewrite of the codebase from scratch, every effort has been made to maintain a nearly identical JSON configuration format.
Any breaking changes are below.

1. Configuration files must be included in the triggering archive.
Lamb-duh no longer supports using a default configuration.
1. *IAM Roles*
    + the *s3:ListBucket* permission is now required for the bucket where the code archive is placed to start the deployment process
    + The *lambda:DeleteAlias* permission is now required
1. *Lambda Tasks*
    + To keep with AWS standards, function handlers now default to `index` instead of the v1 required `lambda`.
    A `handler` property has been added to both the function definition, and the task defaults, and can now be defined for all task functions or per-function.
        + To maintain compatibility, add `"handler": "lambda"` as a setting for all existing Lambda task in the `defaults` object.
1. *API Gateway Tasks*
    + It's no longer possible to operate without a stage configured.
    As API Gateway integration is presumably for deployment, this *shouldn't* impact on production usage; however, it does break for anyone who previously ran without a stage configured.
    + `task.stage` is now `task.deployment.stage`

## Yet another deployment tool?
You're a developer.
You have a way of working with code that works for you.
Going serverless should work that way too.
AWS has a plethora of code tools (Pipeline, Code Deploy) but they don't work together *that* well and they're all focused on **server** deployment.
Wouldn't it be great to deploy **serverless** as easily as Code Deploy?
We need a one-stop serverless deployment, preferably built into AWS itself.

**Lamb-duh** uses AWS Lambda to deploy every part of an application in one step, while keeping the same application structure you're comfortable with.

Whether you're frontend, backend, or full-stack, Lamb-duh has something to help deploy complex web (or any other S3/Lambda/API Gateway) applications.

## Is there a catch?

Lamb-duh won't hold your hand the way other serverless frameworks might.
You'll have to create your own IAM roles, both for Lamb-duh and the functions it deploys.
Don't worry, all of the necessary permissions for Lamb-duh are below, but Lamb-duh assumes only you know best for your own application(s), and suggests never giving a piece of code enough control to write IAM roles and permissions for you.

The down side is that you will have to fill in some IAM role permissions, but the upside is that it's **one time only, to cover all current and future applications you deploy via Lamb-duh** and your deployment process is as simple as placing an archive in an S3 bucket.

## Usage

### Package <u>this</u> application
1. Run `npm install` to pull in all dependencies
1. Run `npm run build` to generate a zip archive (*Lambda Deployment Package.zip*) that you can upload to AWS Lambda
1. Create a function in AWS Lambda, and upload the *zip archive* there
1. Use a role for the function that includes all permissions outlined in **IAM Configuration** below

### Include JSON configuration in <u>your</u> application

JSON configuration and detailed description:

```
{
    "applicationName": "SomeGoodName",
    "snsNotifications": {},
    "taskFilters": {},
    "tasks": []
}
```
+ The *applicationName* will be used as part of the AWS Lambda function naming, and the API Gateway name for the API

+ *snsNotifications* is optional, and can be used to send a message when processing starts, and again when it completes
    + ```{ "topicArn": null, "timeZone": null }```
        + ```"topicArn"``` is the ARN for publication
        + ```"timeZone"``` sets the timezone to use for all timestamps
            + This should be an IANA timezone string, but we're using [Luxon](https://moment.github.io/luxon/index.html) under-the-hood if you really want to get into the details of what can be set

+ *taskFilters* is optional, and very useful when the array of Lambda functions or API Gateway endpoints becomes too large to manually delete from when working with test deployments
    + ```{ "include": { "lambda": null, "apiGateway": null } }```
        + ```"lambda"``` is a string array listing the **functionName** property of the functions to include in deployment  
        ```"lambda": [ "function1", "function2" ]```
        + ```"apiGateway"``` is an object array that can include the **path** or **functionName** on the endpoint (or non-endpoint alias for versioned, not-public functions), and can optionally specify the **method** as well  
        ```"apiGateway": [ { "path": "/gateway/path/to/use" }, { "functionName": "function1" }, { "functionName": "function2", "method": "GET" } ]```
            + If ```"apiGateway"``` is not specified, but one or more functions are listed for ```"lambda"```, ```"apiGateway"``` will automatically be generated for only those functions
    + ```{ "exclude" }``` **- not yet implemented**

+ Objects in the *tasks* array are of 3 types
    + <u>S3 tasks</u>
    ```
    {
        "disabled": false,
        "type": "S3",
        "source": "/a/path/to/frontend",
        "dest": {
            "bucket": "bucketname",
            "key": "optional/key/prefix"
        }
    }
    ```
        + deploy all code in your application from `/a/path/to/frontend` to an S3 bucket named `bucketname` under the `optional/key/prefix` directory within the bucket
        + dest.key is an optional field - use it if you need it
    + <u>Lambda tasks</u>
    ```
    {
        "disabled": false,
        "type": "Lambda",
        "alternatePackageJson":"serverless.package.json",
        "compressionLevel": 0,
        "default": {
            "handler": "lambda",
            "iamRoleArn": "arn:aws:iam::1234567890:role/yourRoleNameHere",
            "memorySize": 256,
            "timeout": 10,
            "runtime": "nodejs8.10"
        },
        "functions": [
            { "name": "nameYourFunction", "source": "/path/to/function.js", "iamRoleArn": "arn:aws:iam::1234567890:role/yourOtherRoleNameHere", "memorySize": 1024, "timeout": 5, "runtime": "nodejs6.10", "handler": "main" }
        ]
    }
    ```
        + run `npm install` on `serverless.package.json` to pull in all need NPM modules
            + for a scenario where you are transitioning an application from server to serverless, you can continue to use `package.json` for your server code, and the alternate for your serverless code
            + if you don't define *alternatePackageJson*, then `package.json` will be used
        + create a function-specific directory tree for `/path/to/function.js`, and traverse all local requires to include them in it (as well as the `node_modules` directory generated by `npm install` above)
        + create a Lambda function named *ld_SomeGoodName_nameYourFunction*, using the role noted by the role arn, the 1024 GB memory configuration, a timeout of 5 seconds, running on NodeJS 6.10, and with the exported function handler property **module.exports.main**
            + if *handler*, *iamRoleArn*, *memorySize*, *timeout*, or *runtime* is not included on the function directly, the defaults configured with `default` will be used
        + deploy the code using the set *compressionLevel* when creating the zip to the function
            + Lambda calculates code size based on the package deployed to it
            + As any compression over 0 will require additional memory,

    + <u>API Gateway tasks</u>
    ```
    {
        "disabled": false,
        "type": "ApiGateway",
        "deployment": {
            "stage": "nameYourStage",
            "production": true,
            "versioningLimits": {
                "keep": 2,
                "expirationHours": 6
            },
        },
        "cors": { "origin": "*" },
        "endpoints": [
            { "path": "/request/path/from/root/{optionalParameters}", "method": "GET", "functionName": "nameYourFunction", "headers": [{ "name": "headerName", "parameterName": "headerSentToLambda" }], "parameters": [{ "name":"query", "parameterName": "queryStringSentToLambda"}], "endpointConfiguration": { "routeProp": "value", "routeArray": ["arr1", "arr2"] } }
        ]
    }
    ```
        + Create an API named `SomeGoodName`
        + Create the path resources
            + `/request`
            + `/request/path`
            + `/request/path/from`
            + `/request/path/from/root`
            + `/request/path/from/root/{optionalParameters}`
        + Create a GET method for `/request/path/from/root/{optionalParameters}`
            + Add the header `headerName` to the method request
            + Add the query string parameter `query` to the method request
            + Generate a body mapping template for the integration request with the following fields
                + `optionalParameters`
                + `headerSentToLambda`
                + `queryStringSentToLambda`
                + `endpointConfiguration`
                    + Pass route constants defined in API Gateway to Lambda functions
                    + Use for one function backing multiple routes with differing configurations
                + `requestor: { ip, userAgent }`
                    + **Always** includes the IP and User Agent string
            + Add a 200 response to the integration response
            + Add a 200 response to the method response
            + Creates a Lambda **function version** with a `nameYourStage`
            + Integrates with Lambda function *ld_SomeGoodName_nameYourFunction:nameYourStage*
                + Add the IAM permission necessary to run *ld_SomeGoodName_nameYourFunction:nameYourStage* in Lambda from this method in API Gateway
        + Create an OPTIONS method for `/request/path/from/root/{optionalParameters}`
            + Sends appropriate CORS response, including the Access-Control-Allow-Origin set to `*`
                + configured with the `"cors": { "origin": "*" }` line
                + `"origin"` is required
                + `"allowed": {}` is optional
                    + `"allowed": { "headers": [] }` will add any header in the array to the *Access-Control-Allow-Headers* value for all API Gateway *OPTIONS* responses
        + Creates the stage deployment named `nameYourStage`


## IAM Configuration

1. Create a new role
    + For **Select Role Type**, select the *AWS Lambda* role under *AWS Service Roles*
    + Do not attach any policies
1. Open the role, and under *Inline Policies* we're going to create 5 new policies
    + **Logging** - which is needed by all AWS Lambda functions
    ```
    "Effect": "Allow",
    "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
    ],
    "Resource": [
        "arn:aws:logs:*:*:*"
    ]
    ```
    + **S3** - For where you will place the code archive to start the deployment process
    ```
    {
        "Effect": "Allow",
        "Action": [
            "s3:ListBucket"
        ],
        "Resource": [
            "arn:aws:s3:::YOUR-BUCKET-NAME-FOR-DROPPING-THE-CODE-ARCHIVE"
        ]
    },
    {
        "Effect": "Allow",
        "Action": [
            "s3:DeleteObject",
            "s3:GetObject",
            "s3:PutObject"
        ],
        "Resource": [
            "arn:aws:s3:::YOUR-BUCKET-NAME-FOR-DROPPING-THE-CODE-ARCHIVE/*"
        ]
    }
    ```
    + **S3** - For ***each*** bucket receiving deployments
    ```
    {
        "Effect": "Allow",
        "Action": [
            "s3:ListBucket"
        ],
        "Resource": [
            "arn:aws:s3:::YOUR-BUCKET-NAME-FOR-DEPLOYMENT"
        ]
    },
    {
        "Effect": "Allow",
        "Action": [
            "s3:DeleteObject",
            "s3:PutObject"
        ],
        "Resource": [
            "arn:aws:s3:::YOUR-BUCKET-NAME-FOR-DEPLOYMENT/*"
        ]
    },
    ```
    + **Lambda**
    ```
    "Effect": "Allow",
    "Action": [
        "iam:PassRole",
        "lambda:CreateAlias",
        "lambda:CreateFunction",
        "lambda:DeleteAlias",
        "lambda:DeleteFunction",
        "lambda:GetFunctionConfiguration",
        "lambda:GetPolicy",
        "lambda:ListAliases",
        "lambda:ListFunctions",
        "lambda:ListVersionsByFunction",
        "lambda:PublishVersion",
        "lambda:RemovePermission",
        "lambda:UpdateAlias",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:AddPermission"
    ],
    "Resource": [
        "*"
    ]
    ```
    + **API Gateway**
        ```
        "Effect": "Allow",
        "Action": [
            "apigateway:DELETE",
            "apigateway:GET",
            "apigateway:PATCH",
            "apigateway:POST",
            "apigateway:PUT"
        ],
        "Resource": [
            "arn:aws:apigateway:*::/*"
        ]
        ```
    + **SNS** *(optional)*
        ```
        "Effect": "Allow",
        "Action": "sns:Publish",
        "Resource": "arn:aws:sns:*:*:*"
        ```
        **NOTE**: the Resource ARN above can be as specific as warranted, including specific to a single topic

## Trigger configuration


+ Lambda Event Source
    + S3
        + To support tarballs
            + On *Object Created >> Put*
            + *Suffix*: `tar`
            + **Recommend:** *Prefix* of your key path if you use one
        + To support Gzipped tarballs
            + On *Object Created >> Put*
            + *Suffix*: `tar.gz`
            + **Recommend:** *Prefix* of your key path if you use one

## Runtime Options

### Per-task Processing
To handle [AWS Lambda limits](https://docs.aws.amazon.com/lambda/latest/dg/limits.html), Lamb-duh splits tasks into sub-task.
The number of tasks per sub-task can be configured with *environment variables*.

#### Available Per-task Variables
+ **lambdasPerTask** - *Default: **10*** - The number of Lambda functions that will be compiled and created/updated per sub-task
+ **minLambdaForSplit** - *Default: **0**, always split tasks* - The threshold # of Lambda functions to process under which a configuration will not split any of its processing into separate sub-tasks.

### Logging
By default, all logging is written to Cloudwatch Logs using a *WARN* level.
You should configure for *DEBUG* or even *TRACE* to correct any initial problems.

#### Set Log Level
Add the *environment variable* **log** on this function in Lambda with the [case insensitive] level as the value.

#### Possible levels
+ Trace
+ Debug
+ Info
+ Warn
+ Error


## License

This is licensed under the GPLv3.
Details are in [License.txt](./License.txt)

## To do:

+ General
    + Support Zip
+ S3 Task
    + Clean up removed files
