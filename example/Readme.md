# Example deployment

This is a simple example covering each of the Lamb-duh task types.

**See the [Lamb-duh repository and documentation](https://github.com/davehermann/lambduh) for further details**

## Generate a deployable archive
Run `node createDeployment.js` in this directory.
This will:

1. Ask for an S3 bucket to deploy the `src/frontend/index.html` file to
1. Ask for an IAM Role ARN to run the `src/backend/functions/hello-world.js` function as in Lambda
1. Generate an complete `src/lamb-duh.configuration.json` file using those two values
1. Create an `example.zip` file containing all three files mentioned above

## Deploy the archive

Use the `lamb-duh` CLI utility to deploy the archive, or manually deploy the archive.

## License

Lamb-duh is licensed under the GPLv3.  
See [License.txt](https://github.com/davehermann/lambduh/blob/master/License.txt)

---

Copyright (C) 2019 David Hermann  
This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, version 3.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
