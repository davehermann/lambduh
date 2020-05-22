const aws = require(`aws-sdk`),
    { Throttle } = require(`../../apiGateway/throttle`),
    { Trace, Debug } = require(`../../../logging`);

const apiGatewayV2 = new aws.ApiGatewayV2({ apiVersion: `2018-11-29` });

function getAllExistingApiRoutes(ApiId, NextToken, routes) {
    if (!routes || !!NextToken)
        return apiGatewayV2.getRoutes({ ApiId, NextToken }).promise()
            // Use a custom throttle as API Gateway limits seem especially problematic for this request
            .then(gatewayData => Throttle(gatewayData, 500))
            .then(gatewayData => {
                if (!routes)
                    routes = [];

                routes = routes.concat(gatewayData.Items);

                return gatewayData.NextToken;
            })
            .then(NextToken => getAllExistingApiRoutes(ApiId, NextToken, routes));
    else {
        routes.sort((a, b) => { return a.RouteKey < b.RouteKey ? -1 : 1; });
        Trace({ routes }, true);
        return Promise.resolve(routes);
    }
}

function retrieveRoute(RouteKey, ApiId, foundRoutes) {
    Debug(`Get route for "${RouteKey}"`);

    // If the route exists, provide that route, otherwise create a new one
    let neededRoute = foundRoutes.filter(route => { return (route.RouteKey == RouteKey); });

    if (neededRoute.length > 1)
        return Promise.reject(new Error(`${neededRoute.length} routes found for ${RouteKey}`));

    return ((neededRoute.length == 1) ? Promise.resolve(neededRoute[0]) : createRoute(RouteKey, ApiId))
        .then(routeToUse => {
            foundRoutes.push(routeToUse);

            Trace({ [`Using Route`]: routeToUse });

            return routeToUse;
        });
}

function createRoute(RouteKey, ApiId) {
    Debug({ "Creating route": { ApiId, RouteKey } }, true);

    return apiGatewayV2.createRoute({ ApiId, RouteKey }).promise()
        .then(gatewayData => Throttle(gatewayData))
        .then(gatewayData => {
            Debug({ "New route": gatewayData }, true);

            return gatewayData;
        });
}

module.exports.GetRoutesForApi = getAllExistingApiRoutes;
module.exports.GetRouteForKey = retrieveRoute;
