# Application Deployment Configuration

[[toc]]

## Include a JSON configuration file in your application

The file should be named `lamb-duh.configuration.json` and should appear at the root of your compressed deployment archive.

[A complete JSON configuration can be found here](./ExampleConfiguration.md), and is the complete JSON document for the structure and detailed descriptions below.

## Root Structure

```json
{
    "applicationName": "MyApplication",
    "history": {},
    "npm": {},
    "snsNotifications": {},
    "taskFilters": {},
    "tasks": []
}
```

| Property | Required | Type | Description |
| -------- | -------- | ---- | ----------- |
| applicationName | yes | String | Used as part of the AWS Lambda function naming, and the API Gateway name for the API<br />*Functions will all be **ld_{applicationName}_{FUNCTION-NAME}*** |
| history | no | Map | Specify options for post-deployment storage of the deployed compressed archive file |
| npm | no | Map | Configure authorization and scopes for registries |
| snsNotifications | no | Map | Used to send a message when processing starts, and again when it completes<br /> [See snsNotifications](#snsnotifications)
| taskFilters | no | Map | Filter the deployment to a sub-set of the configuration<br />*Useful when the array of Lambda functions or API Gateway endpoints becomes too large to manually manage when developing/testing only a few*<br /> [See taskFilters](#taskfilters)
| tasks | yes | Array&lt;Map&gt; | Set of tasks to be performed as part of deployment<br /> [See tasks](#tasks) |

### history

By default, Lamb-duh will store the compressed archive file after the application has been deployed.
The file will be moved to `Lamb-duh_archive/{applicationName}/{timestamp}/{archive-file-name}` in the bucket - and under the key prefix - where the archive file was originally uploaded to trigger the Lamb-duh process.

At present, the only option available is to turn off the historical storage action.

```json
{
    "noHistory": true
}
```

| Property | Required | Type | Description |
| -------- | -------- | ---- | ----------- |
| noHistory | no | Boolean | Turns off the historical storage. The compressed archive file will remain in the bucket at the original upload key after deployment completes |

### npm

If NPM authentication, or other package registries (e.g. [Github Package Registry](https://github.com/features/packages)), are needed, Lamb-duh enables easy configuration for both authentication and package scopes.

```json
{
    "authorization": [
        { "registry": "npm.pkg.github.com", "token": "ABCDEF0123456789" }
    ],
    "registry": [
        { "scope": "exampleorg", "url": "https://npm.pkg.github.com/exampleorg" }
    ]
}
```

| Property | Required | Type | Description |
| -------- | -------- | ---- | ----------- |
| authorization | no | Array&lt;Map&gt; | Objects defining the authentication token for NPM registries<br /><ul><li>`registry` - *required* - The domain name for the registry</li><li>`token` - *required* - The authorization token used to access the registry</li></ul> |
| registry | no | Array&lt;Map&gt; | Objects defining the registry(ies) and scope(s) to be utilized<br /><ul><li>`scope` - *optional* - The scope to use with the registry located at the URL (with or without leading "@")</li><li>`url` - *required* - Full URL for the registry endpoint</li></ul>

### snsNotifications

If included, Lamb-duh will send notifications when beginning and ending processing to the configured topic ARN, including a summary of what is included, and total elapsed runtime at the end.

```json
{
        "topicArn": "arn:aws:sns:us-east-1:1234567890:lamb-duh-deployment",
        "timeZone": "America/New_York"
}
```

| Property | Required | Type | Description |
| -------- | -------- | ---- | ----------- |
| topicArn | yes | String | The ARN for the SNS topic for publication |
| timeZone | yes | String | <ul><li>This should be an IANA timezone string</li><li>Lamb-duh uses [Luxon](https://moment.github.io/luxon/index.html) under-the-hood, and any valid timezone string can be used</li></ul> |

### taskFilters

If included, Lamb-duh will only run the configured tasks.
Lamb-duh will auto-configure *apiGateway* if only the *lambda* key is included.

```json
{ "include": { "lambda": null, "apiGateway": null } }
```

| Property | Type | Description |
| -------- | ---- | ----------- |
| lambda | Array&lt;String&gt; | String array listing the **functionName** property of the functions to include in deployment<br />`{ "lambda": [ "function1", "function2" ] }` |
| apiGateway | Array&lt;Map&gt; | Object array that can include the **path** or **functionName** on the endpoint (or non-endpoint alias for versioned, not-public functions), and can optionally specify the **method** as well<br />`{ "apiGateway": [ { "path": "/gateway/path/to/use" }, { "functionName": "function1" }, { "functionName": "function2", "method": "GET" } ] }`<br /> <ul><li>If `"apiGateway"` is not specified, but one or more functions are listed for `"lambda"`, `"apiGateway"` will automatically be generated from your configuration for only those functions</li></ul> |

## Tasks

Tasks is an array of objects defining deployment steps with different options based on the **type** property.  There are three types of deployment tasks supported by Lamb-duh: S3, Lambda, and API Gateway.

### S3 Tasks

Deploy static files in your application source compressed archive to an S3 bucket.

#### Structure

```json
{
    "type": "S3",
    "disabled": false,
    "source": "./relative/path/to/static/files",
    "dest": {
        "bucket": "bucketname",
        "key": "optional/key/prefix"
    }
}
```

##### What does this structure do?

+ Copy all files found in the compressed archive under `relative/path/to/frontend/` to the bucket `bucketname`.
For each file:
    + Prefixes with `optional/key/prefix/`
    + Set the *Cache-Control* header to **no-cache**
    + Generate a unique *ETag*
+ Remove any files in `bucketname` - under `optional/key/prefix` - that are not included in the source

#### Usage

In the structure above - `./relative/path/to/frontend` will be copied to a bucket named `bucketname` and using the key prefix `optional/key/prefix/`

+ `dest.key` is an optional field - use it if you need it

| Property | Required | Type | Description |
| -------- |:--------:|:----:| ----------- |
| type | yes | String | **S3** for this task |
| disabled | no | Boolean | Is the task disabled?<br />*Will be skipped if `true`*<br /><br />*Default:* **false** |
| source | yes | String | Relative path in compressed archive to files to copy |
| dest | yes | Map | Destination bucket information <ul> <li>`bucket` - the name of the S3 bucket</li> <li>`key` - *optional* - A prefix for all files copied in</li> </ul> |
| cacheControl | no | String | Cache string<br /><br />*Default: **no-cache***

### Lambda Tasks

Deploy multiple functions to Lambda.

For each function:
+ A Lambda function named *ld_{applicationName}_{FUNCTION-NAME}* will be created
+ A unique directory tree will be built for local modules, traversing all relative requires, and only including modules in the Lambda package that are relevant for the function
+ Code will be deployed using the set *compressionLevel* when creating the zip for Lambda deployment
    + Lambda calculates code size based on the package deployed to it, not the zip file
    + Any compression over 0 will require additional memory when building the zip file

#### Structure

```json
{
    "type": "Lambda",
    "disabled": false,
    "alternatePackageJson":"serverless.package.json",
    "compressionLevel": 0,
    "default": {
        "handler": "lambda",
        "iamRoleArn": "arn:aws:iam::1234567890:role/primaryRoleName",
        "memorySize": 256,
        "timeout": 10,
        "runtime": "nodejs8.10"
    },
    "functions": [
        { "name": "lambdaFunction1", "source": "/path/to/function1.js" },
        {
            "name": "lambdaFunction2",
            "source": "/path/to/function2.js",
            "iamRoleArn": "arn:aws:iam::1234567890:role/alternateRoleName",
            "memorySize": 1024,
            "timeout": 5,
            "runtime": "nodejs6.10",
            "handler": "main"
        }
    ]
}
```

##### What does this structure do?

+ Run `npm install` using the `serverless.package.json` file as the `package.json` file
+ Create a Lambda function named `ld_MyApplication_lambdaFunction1` *(Per the **applicationName** property in [Root Structure](#basic-structure) above)*
    + Bundle `path/to/function1.js`, along with all of its local dependencies (and their local dependencies, etc.), as well as `node_modules` and upload as the Lambda function code
    + Set the handler to: **path/to/function1.lambda**
    + Set the IAM role for the function to: **arn:aws:iam::1234567890:role/primaryRoleName**
    + Set the memory size to: **256 MB**
    + Set the timeout to: **10 seconds**
    + Set the runtime to: Lambda's **NodeJS 8** version
+ Create a Lambda function named `ld_MyApplication_lambdaFunction2`
    + Bundle `path/to/function2.js` (and dependencies/node_modules)
    + Set the handler to: **path/to/function2.main**
    + Set the IAM role for the function to: **arn:aws:iam::1234567890:role/alternateRoleName**
    + Set the memory size to: **1024 MB**
    + Set the timeout to: **5 seconds**
    + Set the runtime to: Lambda's **NodeJS 6** version


#### Usage

| Property | Required | Type | Description |
| -------- |:--------:|:----:| ----------- |
| type | yes | String | **Lambda** for this task |
| disabled | no | Boolean | Is the task disabled?<br />*Will be skipped if `true`*<br /><br />*Default:* **false** |
| alternatePackageJson | no | String | When Lamb-duh runs `npm install` it will use the JSON file defined here as its `package.json`<br /><br /> *Default:* **package.json** |
| compressionLevel | no | Number | Compression level to use when creating the deployment package for a function<br /><br />*Default:* **0** |
| default | yes | Map | Specify default values for all functions.<br/><br />*See all optional properties for [Function definition](#function-definition)* |
| functions | yes | Array&lt;Map&gt; | The set of functions to deploy<br/><br />*See [Function definition](#function-definition)* for available properties |

##### Function/Default definition

| Property | Required | In Default | Type | Description |
| -------- |:--------:|:----------:|:----:| ----------- |
| name | yes | no | String | Name of the function |
| source | yes | no | String | Relative path to the function's main code file in the source archive |
| iamRoleArn | no | yes | String | ARN for the role to be used by this function |
| memorySize | no | yes | Number | Memory size for the function <br /> **must be from the set of values allowed by Lambda** |
| timeout | no | yes | Number | Time - in **seconds** - for the Lambda function to time out |
| runtime | no | yes | String | Lambda runtime environment |
| handler | no | yes | String | The name of the export from the main code file to call<br /><br />*Default:* **handler** |

:::tip
Properties than can be set on the `default` object, are noted as "In Default" in the table
:::

### API Gateway Tasks

+ Create an API using the application name defined at the root of the configuration
+ Create resources and methods for API endpoints
    + Add CORS headers to those methods
+ Version Lambda functions attached to the methods
    + Will also version defined Lambda functions that are not deployed as endpoints
+ Create deployment stages, and deploy to those stages

#### Structure
```json
{
    "disabled": false,
    "type": "ApiGateway",
    "deployment": {
        "stage": "yourStageName",
        "production": true,
        "versioningLimits": {
            "keep": 2,
            "expirationHours": 6
        },
    },
    "cors": { "origin": "*" },
    "aliasNonEndpoints": [
        { "functionName": "lambdaFunction1" }
    ],
    "endpoints": [
        {
            "path": "/request/path/from/root/{optionalParameters}",
            "method": "GET",
            "functionName": "lambdaFunction2",
            "headers": [{ "name": "httpHeader1", "parameterName": "header1SentToLambda" }],
            "parameters": [{ "name":"queryParameter", "parameterName": "queryParameterSentToLambda"}],
            "endpointConfiguration": {
                "routeProp": "value",
                "routeArray": ["arr1", "arr2"]
            }
        }
    ]
}
```

##### What does this structure do?

+ Create an API named `MyApplication`
    + *Per the **applicationName** property in [Root Structure](#basic-structure) above*
+ Create a Lambda **function version** for `lambdaFunction1` with the alias of `yourStageName`
+ Create the path resources
    + `/request`
    + `/request/path`
    + `/request/path/from`
    + `/request/path/from/root`
    + `/request/path/from/root/{optionalParameters}`
+ Create a GET method for `/request/path/from/root/{optionalParameters}`
    + Add the header `httpHeader1` to the method request
    + Add the query string parameter `queryParameter` to the method request
    + Generate an `application/json` body mapping template for the integration request with the following fields
        + `optionalParameters`
        + `header1SentToLambda`
        + `queryParameterSentToLambda`
        + `endpointConfiguration`
        + `requestor: { ip, userAgent }`
            + **requestor is <u>always</u> included**, with the IP address and User Agent string for the request
    + Add a 200 response to the integration response
    + Add a 200 response to the method response
    + Create a Lambda **function version** for `lambdaFunction2` with the alias of `yourStageName`
    + Integrate the method with Lambda function *ld_MyApplication_lambdaFunction2:yourStageName*
        + Add the IAM permission necessary to run *ld_MyApplication_lambdaFunction2:yourStageName* in Lambda from this method in API Gateway
+ Create an OPTIONS method for `/request/path/from/root/{optionalParameters}`
    + Sends appropriate CORS response, including the Access-Control-Allow-Origin set to `*`
+ Creates the stage deployment named `yourStageName`

#### Usage

| Property | Required | Type | Description |
| -------- |:--------:|:----:| ----------- |
| type | yes | String | **ApiGateway** for this task |
| disabled | no | Boolean | Is the task disabled?<br />*Will be skipped if `true`*<br /><br />*Default:* **false** |
| deployment | yes | Map | Values for deploying to a stage, and versioning Lambda functions |
| deployment<br />&nbsp;&nbsp;&nbsp;&nbsp;.stage | yes | String | Name of stage to deploy |
| deployment<br />&nbsp;&nbsp;&nbsp;&nbsp;.production | no | Boolean | If **true**, sets a unique version code as part of the versioning step |
| deployment<br />&nbsp;&nbsp;&nbsp;&nbsp;.versioningLimits | no | Map | Control number of versions to maintain<br />*When **deployment.production** == **true***<br /><br />This allows for deploying a production stage with new code, and without breaking a deployed in-use frontend |
| deployment<br />&nbsp;&nbsp;&nbsp;&nbsp;.versioningLimits<br />&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;.keep | no | Number | # of versions to maintain when deploying the same stage |
| deployment<br />&nbsp;&nbsp;&nbsp;&nbsp;.versioningLimits<br />&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;.expirationHours | no | Number | Time, in hours, for expiring a version <ul><li>*Expiration time takes precedence over # to **keep***</li><li>*Lamb-duh <u>will not</u> delete a version until it has expired, even if there are more versions than the maximum to keep*</li></ul> |
| cors | no | Map | Lamb-duh can automatically create an HTTP OPTIONS method of type **MOCK** method for all endpoints to support CORS<br />This value should be `{ "origin": "*" }` for all, or domain-specific for a single domain |
| aliasNonEndpoints | no | Array&lt;Map&gt; | The set of non-endpoint Lambda functions to version<br/><br />*See [Non-endpoint definition](#non-endpoint-definition)* for available properties |
| endpoints | no | Array&lt;Map&gt; | The set of endpoints to deploy<br/><br />*See [Endpoint definition](#endpoint-definition)* for available properties |

##### CORS definition
| Property | Required | Type | Description |
| -------- |:--------:|:----:| ----------- |
| origin | yes | String | Sets the *Access-Control-Allow-Origin* header for CORS |
| allowed | no | Map | Currently supports only one property: **headers** <ul> <li>`headers: []` - adds each header string in the array to the *Access-Control-Allow-Headers* header for CORS</li> </ul> |

##### Non-endpoint definition

| Property | Required | Type | Description |
| -------- |:--------:|:----:| ----------- |
| functionName | yes | String | Name of function, in Lambda, to alias |


##### Endpoint definition

| Property | Required | Type | Description |
| -------- |:--------:|:----:| ----------- |
| path | yes | String | The full path, including optional parameters, to the endpoint resource in API Gateway |
| method | yes | String | The HTTP method for the endpoint |
| functionName | yes | String | Name of function, in Lambda, to alias |
| headers | no | Array&lt;Map&gt; | HTTP Headers to accept and pass through to the Lambda function<br/><br />*See [Endpoint Headers](#endpoint-headers)* for available properties |
| parameters | no | Array&lt;Map&gt; | Query string paramters to accept and pass through to the Lambda function<br/><br />*See [Endpoint Parameters](#endpoint-parameters)* for available properties |
| endpointConfiguration | no | Map | Additional object data to pass through to the Lambda function |

###### headers, parameters, endpointConfiguration, and request data

Lamb-duh uses API Gateway's method integration to pass data through to the Lambda function via a JSON request template.

The `headers:[]` and `parameters:[]` properties are arrays of HTTP headers or query string parameters to be utilized within the Lambda functions.
Both arrays have the same expected signature for values:

| Property | Required | Type | Description |
| -------- |:--------:|:----:| ----------- |
| name | yes | String | Name of *{HTTP Header, Query string parameter}* |
| parameterName | no | String | Property name used in the Lambda function's eventData object<br /><br />*Defaults to **name** property if omitted* |

The `endpointConfiguration:{}` map will be added as-is to the event data under an `endpointConfiguration` property.
This can be used to pass route constants defined in API Gateway to Lambda functions, for instance when one function backs multiple routes with differing configurations


