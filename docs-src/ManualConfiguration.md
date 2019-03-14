# Initial AWS Configuration: Manual

For this walkthrough, use of the AWS Console is assumed.
The names used (IAM role name, Lambda function name, etc.) will match the default names used by the CLI.


## IAM Configuration

### Create a new role
+ This will be a service role with the role type of *Lambda*
+ Do not attach any policies at this step
+ Add a tag with the *key* of **Lamb-duh Resource** and a *value* of **true**
+ *Role Name:* **Lamb-duh_Deployment**
+ *Description:* **Lamb-duh role for deploying applications**

### Attach Inline Policies

This role is going to have five inline policies attached.
The policies below are the JSON for the **Statement** block.

:::tip ARNs
The Resource ARN fields can be as specific as warranted
:::

#### API_Gateway_Management

Manage API Gateway endpoints, stages, and deployments.

```json
    [
        {
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
        }
    ]
```

#### Cloudwatch_Logs

This is needed by all AWS Lambda functions to allow logging

```json
    [
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": [
                "arn:aws:logs:*:*:*"
            ]
        }
    ]
```

#### Lambda_Management

Create, update, and version Lambda functions

```json
    [
        {
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
        }
    ]
```

#### S3_Trigger_Bucket

Where your compressed application archive is placed to start the Lamb-duh deployment process

```json
    [
        {
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::YOUR-TRIGGERING-BUCKET-NAME"
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
                "arn:aws:s3:::YOUR-TRIGGERING-BUCKET-NAME/*"
            ]
        }
    ]
```

#### SNS_Reporting (optional)

If you want notifications sent via SNS topics

```json
    [
        {
            "Effect": "Allow",
            "Action": "sns:Publish",
            "Resource": "arn:aws:sns:*:*:*"
        }
    ]
```

### Additional policy needed for each S3 bucket manipulated by a deployment

Each S3 task in a configuration will overwrite the contents of a bucket-key (prefix)

#### S3_Write_to_YOUR-DESTINATION-BUCKET-NAME
```json
    [
        {
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::YOUR-DESTINATION-BUCKET-NAME"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:DeleteObject",
                "s3:PutObject"
            ],
            "Resource": [
                "arn:aws:s3:::YOUR-DESTINATION-BUCKET-NAME/*"
            ]
        }
    ]
```

## Lambda Configuration

### Create a new function

+ From scratch
+ *Name:* **Lambduh_Deployment**
+ *Runtime:* **Node.js 8.10**
+ *Existing Role:* **Lamb-duh_Deployment**

### Configure Function

+ Upload the `./Lambda Deployment Package.zip` file
+ *Handler:* **deploy.lambda**
+ Add a tag
    + *Key:* **Lamb-duh Resource**
    + *Value:* **true**
+ *Memory Size:* **2048 MB** (or greater)
+ *Timeout:* **2 minutes** (or greater)

### Add Trigger to Function

+ Add S3 trigger for compressed archive
    + For your trigger bucket
    + All object create events
    + *Suffix:* **.zip**
        + Use **.tar.gz** if you prefer, or create a second trigger to handle both
+ Add S3 trigger for Lamb-duh continuing deployment
    + For your trigger bucket
    + All object create events
    + *Suffix:* **.lambduh.txt**
