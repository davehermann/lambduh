(window.webpackJsonp=window.webpackJsonp||[]).push([[12],{354:function(t,a,e){"use strict";e.r(a);var o=e(43),n=Object(o.a)({},(function(){var t=this,a=t.$createElement,e=t._self._c||a;return e("ContentSlotsDistributor",{attrs:{"slot-key":t.$parent.slotKey}},[e("h1",{attrs:{id:"lamb-duh"}},[e("a",{staticClass:"header-anchor",attrs:{href:"#lamb-duh"}},[t._v("#")]),t._v(" Lamb-duh")]),t._v(" "),e("p",[e("strong",[t._v("Stupid name. Stupidly simple serverless deployment to AWS.")])]),t._v(" "),e("h2",{attrs:{id:"introduction"}},[e("a",{staticClass:"header-anchor",attrs:{href:"#introduction"}},[t._v("#")]),t._v(" Introduction")]),t._v(" "),e("p",[t._v("Lamb-duh is a serverless deployment tool for AWS serverless applications that use NodeJS JavaScript functions in Lambda.\nLamb-duh only needs source, compressed into an archive.\nIt will run "),e("code",[t._v("npm install")]),t._v(", and deploy to: S3, Lambda, and API Gateway.\nLamb-duh doesn't care how you structure your application.")]),t._v(" "),e("ol",[e("li",[t._v("Write your application using any directory structure that works for you\n"),e("ul",[e("li",[t._v("All of your AWS Lambda functions and modules must use "),e("strong",[t._v("relative")]),t._v(" paths for "),e("code",[t._v("require()")]),t._v(" of local modules")])])]),t._v(" "),e("li",[t._v("Include a configuration JSON file in the root of your application\n"),e("ul",[e("li",[t._v("Configuration defines the S3, Lambda, and/or API Gateway steps")])])]),t._v(" "),e("li",[t._v("Archive the entire application\n"),e("ul",[e("li",[t._v(".zip, .tar, and .tar.gz all supported!")])])]),t._v(" "),e("li",[t._v("Drop your archive file in an S3 bucket")]),t._v(" "),e("li",[t._v("Profit!")])]),t._v(" "),e("h2",{attrs:{id:"yet-another-deployment-tool"}},[e("a",{staticClass:"header-anchor",attrs:{href:"#yet-another-deployment-tool"}},[t._v("#")]),t._v(" Yet another deployment tool?")]),t._v(" "),e("p",[t._v("You're a developer.\nYou have a way of working with code that works for you.\nGoing serverless should work that way too.\nThere are other serverless management frameworks, and AWS has a number of tools as well.")]),t._v(" "),e("h2",{attrs:{id:"why-can-t-i-just-use-my-normal-code-structure-and-deploy-an-application"}},[e("a",{staticClass:"header-anchor",attrs:{href:"#why-can-t-i-just-use-my-normal-code-structure-and-deploy-an-application"}},[t._v("#")]),t._v(" Why can't I just use my normal code structure, and deploy an application?")]),t._v(" "),e("p",[t._v("With "),e("strong",[t._v("Lamb-duh")]),t._v(", you can!")]),t._v(" "),e("p",[t._v("Lamb-duh uses AWS Lambda to deploy every part of an application in one step, while keeping the same application structure you're comfortable with.")]),t._v(" "),e("p",[t._v("Whether you're frontend, backend, or full-stack, Lamb-duh has something to help deploy complex web (or any other S3/Lambda/API Gateway) applications.")]),t._v(" "),e("h2",{attrs:{id:"is-there-a-catch"}},[e("a",{staticClass:"header-anchor",attrs:{href:"#is-there-a-catch"}},[t._v("#")]),t._v(" Is there a catch?")]),t._v(" "),e("p",[t._v("Lamb-duh can do as much, or as little, of the process to get you up and running as you want.")]),t._v(" "),e("h3",{attrs:{id:"do-you-want-a-cli-utility-to-handle-heavy-lifting"}},[e("a",{staticClass:"header-anchor",attrs:{href:"#do-you-want-a-cli-utility-to-handle-heavy-lifting"}},[t._v("#")]),t._v(" Do you want a CLI utility to handle heavy lifting?")]),t._v(" "),e("p",[t._v("Lamb-duh has a CLI utility (yes, "),e("u",[t._v("of course")]),t._v(" there's a CLI utility) that can:")]),t._v(" "),e("ul",[e("li",[t._v("Take care of the entire AWS configuration\n"),e("ul",[e("li",[t._v("Create a Lambda function")]),t._v(" "),e("li",[t._v("Attach triggers to an S3 bucket for the function in Lambda")]),t._v(" "),e("li",[t._v("Create an IAM role")]),t._v(" "),e("li",[t._v("Add all necessary permissions to run the function, and manipulate API Gateway, Lambda, and S3")])])]),t._v(" "),e("li",[t._v("Repeatedly deploy updates\n"),e("ul",[e("li",[t._v("To development, testing, and production stages")])])])]),t._v(" "),e("h3",{attrs:{id:"do-you-hate-to-have-an-application-doing-any-of-that"}},[e("a",{staticClass:"header-anchor",attrs:{href:"#do-you-hate-to-have-an-application-doing-any-of-that"}},[t._v("#")]),t._v(" Do you hate to have an application doing any of that?")]),t._v(" "),e("p",[t._v("All of Lamb-duh's requirements are spelled out explicitly.\nA manual step-by-step is included as part of this guide.\nIf you do like to keep control, the down side is that you will have to fill in some IAM role permissions, but the upside is that it's "),e("strong",[t._v("one time only, to cover all current and future applications you deploy via Lamb-duh")]),t._v(".\nThe deployment process is as simple as placing a compressed archive file in an S3 bucket.")])])}),[],!1,null,null,null);a.default=n.exports}}]);