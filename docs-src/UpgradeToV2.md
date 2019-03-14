# v1 to v2 Migration
## Major Changes
+ Lambda installation, local configuration and deployment **now via a CLI**
+ Complete, from-scratch rewrite of the codebase
+ **Lamb-duh** leverages AWS services even more to boost efficiency
+ Large deployments are considerably faster
+ Deployments are now versioned (**off by default**), which allows for <u>not</u> breaking users browser applications that may be cached.
    + S3 deployments can have the endpoint string automatically updated
    + For local testing/manual updates: following deployment the log will contain the correct endpoint, and using the SNS notification will supply it via SNS.
    + The number of saved aliases can be controlled, both as total numbers and amount of time
    + See below for more details and how to turn the feature off
+ Start/Completion notifications now provided (via SNS)

## Breaking Changes
While v2.0.0 is a total rewrite of the codebase from scratch, every effort has been made to maintain a nearly identical JSON configuration format.
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
