Necessary Configuration:
+ IAM User
    + Logging
        + Allow
            + logs:CreateLogGroup
            + logs:CreateLogStream
            + logs:PutLogEvents
        + Resource
            + `arn:aws:logs:*:*:*`
    + S3 - Read the source zip
        + Allow
            + s3:GetObject
        + Resource
            + `arn:aws:s3:::`*source-bucket-name/key-if-any/**
    + S3 - Write Files for S3 Tasks
        + Allow
            + s3:DeleteObject
            + s3:PutObject
        + Resource
            + `arn:aws:s3:::`*destination-bucket-name/key-if-any/**
    + S3 - List files for S3 Tasks
        + Allow
            + s3:ListBucket
        + Resource
            + `arn:aws:s3:::`*destination-bucket-name/key-if-any*
    + Lambda
        + Allow
            + iam:PassRole
            + lambda:CreateFunction
            + lambda:ListFunctions
            + lambda:updateFunctionCode
            + lambda:updateFunctionConfiguration
        + Resource
            + `*`
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

To do:

+ General
    + Support Zip
+ S3 Task
    + Clean up removed files
+ Lambda Task
    + Generate function from source javascript file
        + Build each function to its own dependencies
+ API Gateway Task
    + Create path/method as-needed, and hook to Lambda function
