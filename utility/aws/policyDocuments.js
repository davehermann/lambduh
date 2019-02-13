const assumeRoleLambda = {
    name: `Trust provider for Lambda`,
    document: {
        Version: `2012-10-17`,
        Statement: [
            {
                Effect: `Allow`,
                Principal: {
                    Service: `lambda.amazonaws.com`,
                },
                Action: `sts:AssumeRole`,
            }
        ],
    },
};

module.exports.TrustedEntity = assumeRoleLambda;

const loggingPolicy = {
    name: `Cloudwatch Logs`,
    description: `Create logs, and write to logging`,
    document: {
        Version: `2012-10-17`,
        Statement: [
            {
                Effect: `Allow`,
                Action: [
                    `logs:CreateLogGroup`,
                    `logs:CreateLogStream`,
                    `logs:PutLogEvents`
                ],
                Resource: [
                    `arn:aws:logs:*:*:*`
                ],
            },
        ],
    },
};

const s3TriggerBucket = {
    name: `S3 Trigger Bucket`,
    description: `Read, add, and delete files from the bucket used to trigger Lamb-duh`,
    document: {
        Version: `2012-10-17`,
        Statement: [
            {
                Effect: `Allow`,
                Action: [
                    `s3:ListBucket`,
                ],
                Resource: [
                    `arn:aws:s3:::{TRIGGER_BUCKET_NAME}`,
                ],
            },
            {
                Effect: `Allow`,
                Action: [
                    `s3:DeleteObject`,
                    `s3:GetObject`,
                    `s3:PutObject`,
                ],
                Resource: [
                    `arn:aws:s3:::{TRIGGER_BUCKET_NAME}/*`,
                ],
            },
        ],
    },
};

const lambdaFunctions = {
    name: `Lambda Management`,
    description: `Create, manage, and version function code in Lambda`,
    document: {
        Version: `2012-10-17`,
        Statement: [
            {
                Effect: `Allow`,
                Action: [
                    `iam:PassRole`,
                    `lambda:AddPermission`,
                    `lambda:CreateAlias`,
                    `lambda:CreateFunction`,
                    `lambda:DeleteAlias`,
                    `lambda:DeleteFunction`,
                    `lambda:GetFunctionConfiguration`,
                    `lambda:GetPolicy`,
                    `lambda:ListAliases`,
                    `lambda:ListFunctions`,
                    `lambda:ListVersionsByFunction`,
                    `lambda:PublishVersion`,
                    `lambda:RemovePermission`,
                    `lambda:UpdateAlias`,
                    `lambda:UpdateFunctionCode`,
                    `lambda:UpdateFunctionConfiguration`
                ],
                Resource: [
                    `*`
                ]
            }
        ]
    },
};

const apiGatewayApis = {
    name: `API Gateway Management`,
    description: `Manage endpoints, stages, and releases in API Gateway`,
    document: {
        Version: `2012-10-17`,
        Statement: [
            {
                Effect: `Allow`,
                Action: [
                    `apigateway:DELETE`,
                    `apigateway:GET`,
                    `apigateway:PATCH`,
                    `apigateway:POST`,
                    `apigateway:PUT`
                ],
                Resource: [
                    `arn:aws:apigateway:*::/*`
                ]
            }
        ]
    },
};

const snsReporting = {
    name: `SNS Reporting`,
    description: `Report start and end of deployments via SNS`,
    document: {
        Version: `2012-10-17`,
        Statement: [
            {
                Effect: `Allow`,
                Action: `sns:Publish`,
                Resource: `arn:aws:sns:*:*:*`
            }
        ]
    },
};

module.exports.PermissionSet = [
    loggingPolicy,
    s3TriggerBucket,
    lambdaFunctions,
    apiGatewayApis,
    snsReporting,
];
