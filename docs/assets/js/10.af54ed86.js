(window.webpackJsonp=window.webpackJsonp||[]).push([[10],{175:function(a,t,e){"use strict";e.r(t);var o=e(0),n=Object(o.a)({},function(){this.$createElement;this._self._c;return this._m(0)},[function(){var a=this,t=a.$createElement,e=a._self._c||t;return e("div",{staticClass:"content"},[e("h1",{attrs:{id:"lamb-duh"}},[e("a",{staticClass:"header-anchor",attrs:{href:"#lamb-duh","aria-hidden":"true"}},[a._v("#")]),a._v(" Lamb-duh")]),a._v(" "),e("p",[e("strong",[a._v("Stupid name. Stupidly simple serverless deployment to AWS.")])]),a._v(" "),e("h2",{attrs:{id:"introduction"}},[e("a",{staticClass:"header-anchor",attrs:{href:"#introduction","aria-hidden":"true"}},[a._v("#")]),a._v(" Introduction")]),a._v(" "),e("p",[a._v("Lamb-duh is a serverless deployment tool for AWS serverless applications that use NodeJS JavaScript functions in Lambda.\nLamb-duh only needs source, compressed into an archive.\nIt will run "),e("code",[a._v("npm install")]),a._v(", and deploy to: S3, Lambda, and API Gateway.\nLamb-duh doesn't care how you structure your application.")]),a._v(" "),e("ol",[e("li",[a._v("Write your application using any directory structure that works for you\n"),e("ul",[e("li",[a._v("All of your AWS Lambda functions and modules must use "),e("strong",[a._v("relative")]),a._v(" paths for "),e("code",[a._v("require()")]),a._v(" of local modules")])])]),a._v(" "),e("li",[a._v("Include a configuration JSON file in the root of your application\n"),e("ul",[e("li",[a._v("Configuration defines the S3, Lambda, and/or API Gateway steps")])])]),a._v(" "),e("li",[a._v("Archive the entire application\n"),e("ul",[e("li",[a._v(".zip, .tar, and .tar.gz all supported!")])])]),a._v(" "),e("li",[a._v("Drop your archive file in an S3 bucket")]),a._v(" "),e("li",[a._v("Profit!")])]),a._v(" "),e("h2",{attrs:{id:"yet-another-deployment-tool"}},[e("a",{staticClass:"header-anchor",attrs:{href:"#yet-another-deployment-tool","aria-hidden":"true"}},[a._v("#")]),a._v(" Yet another deployment tool?")]),a._v(" "),e("p",[a._v("You're a developer.\nYou have a way of working with code that works for you.\nGoing serverless should work that way too.\nThere are other serverless management frameworks, and AWS has a number of tools as well.")]),a._v(" "),e("h2",{attrs:{id:"why-can-t-i-just-use-my-normal-code-structure-and-deploy-an-application"}},[e("a",{staticClass:"header-anchor",attrs:{href:"#why-can-t-i-just-use-my-normal-code-structure-and-deploy-an-application","aria-hidden":"true"}},[a._v("#")]),a._v(" Why can't I just use my normal code structure, and deploy an application?")]),a._v(" "),e("p",[a._v("With "),e("strong",[a._v("Lamb-duh")]),a._v(", you can!")]),a._v(" "),e("p",[a._v("Lamb-duh uses AWS Lambda to deploy every part of an application in one step, while keeping the same application structure you're comfortable with.")]),a._v(" "),e("p",[a._v("Whether you're frontend, backend, or full-stack, Lamb-duh has something to help deploy complex web (or any other S3/Lambda/API Gateway) applications.")]),a._v(" "),e("h2",{attrs:{id:"is-there-a-catch"}},[e("a",{staticClass:"header-anchor",attrs:{href:"#is-there-a-catch","aria-hidden":"true"}},[a._v("#")]),a._v(" Is there a catch?")]),a._v(" "),e("p",[a._v("Lamb-duh can do as much, or as little, of the process to get you up and running as you want.")]),a._v(" "),e("h3",{attrs:{id:"do-you-want-a-cli-utility-to-handle-heavy-lifting"}},[e("a",{staticClass:"header-anchor",attrs:{href:"#do-you-want-a-cli-utility-to-handle-heavy-lifting","aria-hidden":"true"}},[a._v("#")]),a._v(" Do you want a CLI utility to handle heavy lifting?")]),a._v(" "),e("p",[a._v("Lamb-duh has a CLI utility (yes, "),e("u",[a._v("of course")]),a._v(" there's a CLI utility) that can:")]),a._v(" "),e("ul",[e("li",[a._v("Take care of the entire AWS configuration\n"),e("ul",[e("li",[a._v("Create a Lambda function")]),a._v(" "),e("li",[a._v("Attach triggers to an S3 bucket for the function in Lambda")]),a._v(" "),e("li",[a._v("Create an IAM role")]),a._v(" "),e("li",[a._v("Add all necessary permissions to run the function, and manipulate API Gateway, Lambda, and S3")])])]),a._v(" "),e("li",[a._v("Repeatedly deploy updates\n"),e("ul",[e("li",[a._v("To development, testing, and production stages")])])])]),a._v(" "),e("h3",{attrs:{id:"do-you-hate-to-have-an-application-doing-any-of-that"}},[e("a",{staticClass:"header-anchor",attrs:{href:"#do-you-hate-to-have-an-application-doing-any-of-that","aria-hidden":"true"}},[a._v("#")]),a._v(" Do you hate to have an application doing any of that?")]),a._v(" "),e("p",[a._v("All of Lamb-duh's requirements are spelled out explicitly.\nA manual step-by-step is included as part of this guide.\nIf you do like to keep control, the down side is that you will have to fill in some IAM role permissions, but the upside is that it's "),e("strong",[a._v("one time only, to cover all current and future applications you deploy via Lamb-duh")]),a._v(".\nThe deployment process is as simple as placing a compressed archive file in an S3 bucket.")])])}],!1,null,null,null);t.default=n.exports}}]);