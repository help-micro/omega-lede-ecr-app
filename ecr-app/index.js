var http = require('http'),
	https = require('https'),
    httpProxy = require('http-proxy');
	
var session = require('express-session');
var express = require("express");
var app = express();
var uuid = require('uuid');
var cmd = require('node-cmd');

var localtunnel = require('localtunnel');

var common = require('./common');

var client = require('./client');

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
	console.log(err);

  	res.end('Device is offline');
});

// Check if global address is available
var isForwardActive = false;

// Port to be forwarded
var localTunnelPort = 5050;

// Temporary username for the access from a global network
var localTunnelUsername = uuid.v4().toString();

// Temporary password for the access from a global network
var localTunnelPassword = uuid.v4().toString();

// Timeout interval to update current info about a localtunnel service
var localTunnelInterval = 15000;

// Endpoint API URL
var localTunnelApiEndpoint = 'http://ecr.help-micro.com.ua/data/devices/set-access-url';

// Endpoint API key
var localTunnelApiKey = null;

// Global address
var localTunnelAddress = "";

// Maximum number of attempts to notify the server about URL
const MAX_ATTEMPTS = 3;

// Number of attempts to notify the server about URL
var localTunnelAttempts = 0;

// Serial number of a device
var serialNumber = null;

var isServerNotified = false;

// Set session
app.use(session({
    secret: uuid.v4().toString(),
    resave: true,
    saveUninitialized: true
}));


// Login endpoint
app.get('/login', function (req, res) {
	
  if (!req.query.username || !req.query.password) {
    res.send('login failed');    
  } else if(req.query.username === localTunnelUsername || req.query.password === localTunnelPassword) {
    req.session.user = localTunnelPassword;
    req.session.admin = true;
    res.redirect('/');
  }
});
 

app.use(function(req, res) {
	
	var isLocal = req.connection.remoteAddress.includes("127.0.0.1") ? false : true;
	//console.log(req.connection.remoteAddress);
	//console.log(req.session, isLocal);
	if ((req.session && req.session.admin) || isLocal)
		return proxy.web(req, res, { target: 'http://' + global.ip + ':80' });
	  else
		return res.sendStatus(401);
	
  // You can define here your custom logic to handle the request
  // and then proxy the request.
  
});

//
// Create your custom server and just call `proxy.web()` to proxy
// a web request to the target passed in the options
// also you can use `proxy.ws()` to proxy a websockets request
//
var server = http.createServer(app);

//console.log("listening on port 5050")
server.listen(localTunnelPort);

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

// Notify a remote server about a global address
function notifyAboutTunnel() {
	
	// If API key is set
	if (localTunnelApiKey != null) {
		
		// If the server was not previously notified about new address
		if (localTunnelAttempts < MAX_ATTEMPTS && !isServerNotified) {
			
			console.log('notify');
			
			// Set headers, options, and body
			var headers = {
				'Authorization': 'Bearer ' + localTunnelApiKey
			};
			var extraOptions = {
				headers: headers,
				json: true 
			};
			var body = {
				serial: serialNumber,
				url: localTunnelAddress
			};
			
			// Run requests
			client.runRequestUnauthorized(localTunnelApiEndpoint, 'POST', body, extraOptions).then(function (response) {
				isServerNotified = true;
				localTunnelAttempts = 0;
			}, function (err) {
				localTunnelAttempts += 1;
			});
		} 
		else {
			localTunnelAttempts = 0;
			isServerNotified = false;
		}
	}
}

// Get the serial number of a device
function getSerialNumber() {
	if (serialNumber == null) {
		client.setUrl("http://" + common.ip);
		client.runRequest('/cgi/state', 'GET', undefined, {json: true}).then(function (response) {
			if ('serial' in response) {
				serialNumber = response['serial'];
			}
		}, function (err) {  });
	}
}

setInterval(function() {
	getSerialNumber();
}, localTunnelInterval);

// Get API key and start the process of the retrieving of a global address 
cmd.get(`uci get system.@system[0].api`, function (err, data, stderr) {
	localTunnelApiKey = data.trim();
	if (localTunnelApiKey.length == 32) { 
		setInterval(function () {
			try {
				if (!isForwardActive) {
					localtunnel(localTunnelPort, function(err, tunnel) {
						if (err) { isForwardActive = false; localTunnelAddress = "-"; }

						// the assigned public url for your tunnel
						// i.e. https://abcdefgjhij.localtunnel.me
						else {
							isForwardActive = true;
							isServerNotified = false;
							localTunnelAddress = tunnel.url + "/login?username=" + localTunnelUsername + "&password=" + localTunnelPassword;
							notifyAboutTunnel();
						}
					});  
				}
			}
			catch (e) {
				
				isForwardActive = false;
			}
			notifyAboutTunnel();
			
		}, localTunnelInterval);
	}
});


process.on('uncaughtException', function (err) {
    isForwardActive = false;
	localTunnelAddress = '-';
});


