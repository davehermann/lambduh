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
            + `arn:aws:s3:::`*bucket-name/key-if-any/**
    + S3 - Write Files for S3 Tasks
        + Allow
            + s3:PutObject
        + Resource
            + `arn:aws:s3:::`*bucket-name/key-if-any/**
+ Lambda Event Source
    + S3
        + For the bucket containing your source tarballs
        + On *Object Created >> Put*
        + *Suffix*: tar
        + **Recommend:** *Prefix* of your key path if you use one

To do:

+ S3 Task
    + Clean up removed files
+ Lambda Task
    + Generate function from source javascript file
        + Build each function to its own dependencies
+ API Gateway Task
    + Create path/method as-needed, and hook to Lambda function
