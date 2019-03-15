# Lamb-duh Runtime Options in AWS Lambda

Lamb-duh supports options for logging, and task splitting, via environment variables.

## Logging
By default, all logging is written to Cloudwatch Logs using a *WARN* level.

When initially deploying an application via Lamb-duh, it may be beneficial to use *DEBUG* to track down any configuration issues.

### Set Log Level
Add the *environment variable* **log** to the function within Lambda with the **case <u>insensitive</u>** level as the value.

#### Possible levels
+ Trace
+ Debug
+ Info
+ Warn
+ Error


## Per-task Processing
To handle [AWS Lambda limits](https://docs.aws.amazon.com/lambda/latest/dg/limits.html), Lamb-duh splits tasks into sub-task.
The number of tasks per sub-task can be configured.

| Environment Variable Key | Default | Description |
| ------------------------ |:-------:| ----------- |
| **lambdasPerTask** | 10 | The number of Lambda functions that will be compiled and created/updated per sub-task |
| **minLambdaForSplit** | 0<br />*always split tasks* | The threshold # of Lambda functions to process under which a configuration will not split any of its processing into separate sub-tasks. |
