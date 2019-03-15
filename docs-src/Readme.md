# Lamb-duh

**Stupid name. Stupidly simple serverless deployment to AWS.**

## Introduction

Lamb-duh is a serverless deployment tool for AWS serverless applications using NodeJS functions.
Lamb-duh only needs source, compressed into an archive, and will run `npm install`, and deploy to: S3, Lambda, and API Gateway.
Lamb-duh doesn't care how you structure your application.

1. Write your application using any directory structure that works for you
    + All of your AWS Lambda functions and modules must use **relative** paths for `require()` of local modules
1. Include a configuration JSON file in the root of your application
    + Defines the S3, Lambda, and/or API Gateway steps
1. Archive the entire application
    + .zip, .tar, and .tar.gz all supported!
1. Drop your archive file in an S3 bucket
1. Profit!

## Yet another deployment tool?
You're a developer.
You have a way of working with code that works for you.
Going serverless should work that way too.
There are other serverless management frameworks, and AWS has a number of tools as well.
> Why can't I just use my normal code structure, and deploy an application?

With **Lamb-duh**, you can!

Lamb-duh uses AWS Lambda to deploy every part of an application in one step, while keeping the same application structure you're comfortable with.

Whether you're frontend, backend, or full-stack, Lamb-duh has something to help deploy complex web (or any other S3/Lambda/API Gateway) applications.

## Is there a catch?

Lamb-duh can do as much, or as little, of the process to get you up and running as you want.

### Do you want a CLI utility to handle heavy lifting?

Lamb-duh has a CLI utility that can:
+ Take care of the entire AWS configuration
    + Create a Lambda function
    + Attach triggers to an S3 bucket for the function in Lambda
    + Create an IAM role
    + Add all necessary permissions to run the function, and manipulate API Gateway, Lambda, and S3
+ Repeatedly deploy updates
    + To development, testing, and production stages

### Do you hate to have an application doing any of that?
All of Lamb-duh's requirements are spelled out explicitly.
A manual step-by-step is included as part of this guide.
If you do like to keep control, the down side is that you will have to fill in some IAM role permissions, but the upside is that it's **one time only, to cover all current and future applications you deploy via Lamb-duh**.
The deployment process is as simple as placing a compressed archive file in an S3 bucket.
