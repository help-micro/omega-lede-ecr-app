var extend = require('extend');
var digestRequest = require('request-digest')('admin', '555555');

/**
 * Client URL
 */
var url;

/**
 * Set URL
 * @param _url
 */
exports.setUrl = function (_url) {
    url = _url;
};

/**
 * Run HTTP request
 * @param uri
 * @param method
 * @param data
 * @param extraOptions
 * @returns {Promise}
 */
exports.runRequest = function (uri, method, data, extraOptions) {
    return new Promise(function (resolve, reject) {
        var options = {
            method: method,
            host: url,
            path: uri,
			encoding: null
        };
        if (data !== undefined) {
            options.body = data;//JSON.stringify(data);
        }
        if (extraOptions !== undefined) { 
            extend(options, extraOptions);
        } 
        digestRequest.request(options, function (error, response, body) {
            if (error) {
                reject(error);
            }
            else {
                resolve(body);
            }
        });
    });
};