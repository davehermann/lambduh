# Lamb-duh
#### Stupid name. Stupidly simple serverless deployment to AWS.

Lamb-duh is a serverless deployment tool for AWS serverless applications built around NodeJS JavaScript functions in AWS Lambda.

## TL;DR?

1. Write your application using any directory structure that works for you
    + All of your AWS Lambda functions and modules must use **relative** paths for `require()` of local modules
1. Include a configuration JSON file in the root of your application
    + Configuration defines the S3, Lambda, and/or API Gateway steps
1. Archive the entire application
    + .zip, .tar, and .tar.gz all supported!
1. Drop your archive file in an S3 bucket
1. Profit!

## Yet another deployment tool?
You're a developer.
You have a way of working with code that works for you.
Going serverless should work that way too.
AWS has numerous code tools (Pipeline, Code Deploy, Cloud Formation) some of which even deploy to their serverless infrastructure, but wouldn't it be great to deploy **serverless** applications using **serverless** infrastructure?

**Lamb-duh** uses AWS Lambda to deploy every part of an application in one step, while keeping the same application structure you're comfortable with.

Whether you're frontend, backend, or full-stack, Lamb-duh has something to help deploy complex web (or any S3/Lambda/API Gateway) applications, or individual parts.

## Getting started

See the project documentation for:
+ Manual setup within AWS
+ Necessary application configuration
+ Using the CLI utility (yes, <u>of course</u> there's a CLI utility) to automate AWS setup and deployment

## License

Lamb-duh is licensed under the GPLv3.  
See [License.txt](./License.txt)

---

Copyright (C) 2019 David Hermann  
This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, version 3.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
