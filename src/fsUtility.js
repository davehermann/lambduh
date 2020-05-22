// Node Modules
const fs = require(`fs`),
    path = require(`path`);

/**
 * Create the directory structure for the given path
 * @param {String} fullPath - Path to file system resource
 * @param {Boolean} endsWithFileName - Does the path end with a file name
 */
async function createPath(fullPath, endsWithFileName = false) {
    // Get an array of the path parts for the directory
    let pathParts = (endsWithFileName ? path.dirname(fullPath) : fullPath).split(path.sep);

    await createMissingDirectories(pathParts);
}

async function createMissingDirectories(pathParts, confirmedRoot) {
    // Process next subdirectory in the path
    if (pathParts.length > 0) {
        // The first time through, use the root
        if (confirmedRoot === undefined)
            confirmedRoot = path.sep;

        // Join the existing path with the next subdirectory
        let checkPath = path.join(confirmedRoot, pathParts.shift()),
            directoryExists = false;

        try {
            // Check for the directory already existing
            await fs.promises.stat(checkPath);
            // If fs.stat doesn't have an error, the directory exists
            directoryExists = true;
        } catch (err) {
            // Ignore not existing, but throw any other error
            if (err.code !== `ENOENT`)
                throw err;
        }

        // Create the directory if it doesn't exist
        if (!directoryExists)
            await fs.promises.mkdir(checkPath);

        // Process any remaining subdirectories in the path
        await createMissingDirectories(pathParts, checkPath);
    }
}

/**
 * Remove a file or directory
 * @param {String} path - Path to file system resource
 */
async function removePath(removalRoot) {
    // Get data about the path object
    let pathData = await fs.promises.lstat(removalRoot);

    // If it's a file or symlink, unlink it
    if (pathData.isFile() || pathData.isSymbolicLink())
        await fs.promises.unlink(removalRoot);
    else if (pathData.isDirectory()) {
        // For directories, get all sub-objects
        let fsObjects = await fs.promises.readdir(removalRoot);

        // Empty the directory
        while (fsObjects.length > 0)
            await removePath(path.join(removalRoot, fsObjects.shift()));

        // Then remove it
        await fs.promises.rmdir(removalRoot);
    }
}

module.exports.CreatePathParts = createPath;
module.exports.RemovePath = removePath;
