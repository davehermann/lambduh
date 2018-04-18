"use strict";

const aws = require(`aws-sdk`),
    { Throttle } = require(`../throttle`),
    { Dev, Trace, Debug } = require(`../../../logging`);

const apiGateway = new aws.APIGateway({ apiVersion: `2015-07-09` });

function getAllExistingApiResources(restApiId, position, resources) {
    if (!resources || !!position)
        return apiGateway.getResources({ restApiId, position }).promise()
            // Use a custom throttle as API Gateway limits seem especially problematic for this request
            .then(gatewayData => Throttle(gatewayData, 500))
            .then(gatewayData => {
                if (!resources)
                    resources = [];

                resources = resources.concat(gatewayData.items);

                return gatewayData.position;
            })
            .then(gatewayPosition => getAllExistingApiResources(restApiId, gatewayPosition, resources));
    else {
        resources.sort((a, b) => { return a.path < b.path ? -1 : 1; });
        Trace({ resources }, true);
        return Promise.resolve(resources);
    }
}

function retrieveEndpointResource(endpointPath, restApiId, foundResources) {
    let pathParts = endpointPath.split(`/`).map(part => { return part.length > 0 ? part : null; });

    Debug(`Get resource for ${endpointPath}`);

    return createOrRetrieveResources(pathParts, restApiId, foundResources);
}

function createOrRetrieveResources(pathParts, restApiId, existingResources, parentResource) {
    Dev({ pathParts, parentResource }, true);

    if (pathParts.length > 0) {
        if (!parentResource)
            parentResource = { id: undefined };

        let subPath = pathParts.shift(),
            // Find the children of the parent resource
            resourceChildren = existingResources.filter(resource => { return resource.parentId == parentResource.id; }),
            // Find the child that matches this subPath
            subPathResource = resourceChildren.filter(resource => { return resource.pathPart == subPath; });

        Dev({ subPath, resourceChildren, subPathResource }, true);

        if (subPathResource.length > 1)
            return Promise.reject(`${subPathResource.length} child resources found for ${parentResource.path}`);

        return ((subPathResource.length == 1) ? Promise.resolve(subPathResource[0]) : createResource(restApiId, subPath, parentResource.id))
            .then(newResource => {
                existingResources.push(newResource);
                return newResource;
            })
            .then(newResource => createOrRetrieveResources(pathParts, restApiId, existingResources, newResource));
    } else
        return Promise.resolve(parentResource);
}

function createResource(restApiId, pathPart, parentId) {
    Debug({ "Creating resource": { restApiId, pathPart, parentId } }, true);

    return apiGateway.createResource({ restApiId, parentId, pathPart }).promise()
        .then(gatewayData => Throttle(gatewayData))
        .then(gatewayData => {
            Debug({ "New resource": gatewayData }, true);

            return gatewayData;
        });
}

module.exports.GetResourcesForApi = getAllExistingApiResources;
module.exports.GetResourceForPath = retrieveEndpointResource;
