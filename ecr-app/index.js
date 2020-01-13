var http = require('http'),
	https = require('https'),
    httpProxy = require('http-proxy');

var common = require('./common');

// CA certificates
var rootCas = require('ssl-root-cas/latest').create();
//rootCas.addFile(__dirname + '/ssl/cert.cer');
https.globalAgent.options.ca = rootCas;
	
//var report = require('./report.js');

var undefined;

// Cash register IP address
global.ip = common.ip;

// Common error message if the type of the error isn't detected
var commonErrorMessage = "Device is offline";

// Global variable to check if the processing ability is locked
global.isLocked = false;

// Timeout interval to examine the cash register
var interval = 3000;

//
// Create a proxy server with custom application logic
//
var proxy = httpProxy.createProxyServer({
	proxyTimeout: 40000
});

proxy.on('error', function (err, req, res) {
	res.writeHead(500, {
    	'Content-Type': 'text/plain'
  	});

  	res.end('Device is offline');
});

//
// Create your custom server and just call `proxy.web()` to proxy
// a web request to the target passed in the options
// also you can use `proxy.ws()` to proxy a websockets request
//
var server = http.createServer(function(req, res) {
  // You can define here your custom logic to handle the request
  // and then proxy the request.
  proxy.web(req, res, { target: 'http://' + global.ip + ':80' });
});

//console.log("listening on port 5050")
server.listen(5050);

//
// Create a HTTP Proxy server with a HTTPS target
//
var proxyHTTPS = httpProxy.createProxyServer();
var serverProxy = http.createServer(function(req, res) {
	//console.log(req.headers);
	var targetHost = req.headers['proxy-host'];
	proxyHTTPS.web(req, res, {
		target: 'https://' + targetHost,
		agent  : https.globalAgent,
		headers: {
			host: targetHost
		},
		secure: false
	});
});
serverProxy.listen(3000);
