"use strict";

// All API Gateway requests are limited to 10 per second
function throttle(data, delay) {
    return new Promise(resolve => {
        setTimeout(() => { resolve(data); }, delay || 110);
    });
}

module.exports.Throttle = throttle;
