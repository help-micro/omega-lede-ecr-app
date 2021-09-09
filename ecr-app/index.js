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

var HID = require('node-hid');
var usbDetect = require('usb-detection');

/**
* Set URL in client
*/
url = 'http://' + common.ip;
client.setUrl(url);

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
var localTunnelInterval = 60000;

// Endpoint API URL
var localTunnelApiEndpoint = 'http://ecr.help-micro.com.ua/data/devices/set-access-url';

// Endpoint API key
var localTunnelApiKey = null;

// Local tunnel server
var localTunnelServer = "";

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
		return proxy.web(req, res, { target: 'http://' + global.ip + ':80', proxyTimeout: 1000  });
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
		client.runRequest('/cgi/state', 'GET', undefined, {json: true}).then(function (response) {
			if ('serial' in response) {
				serialNumber = response['serial'];
			}
		}, function (err) {  });
	}
}

setInterval(function() {
	getSerialNumber();
}, 5000);

function isValidURL(string) {
  var res = string.match(/(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g);
  return (res !== null)
}

// Get API key and start the process of the retrieving of a global address 
cmd.get(`uci get system.@system[0].api`, function (err, data, stderr) {
	localTunnelApiKey = data.trim();
	if (localTunnelApiKey.length == 32) { 
		
		cmd.get(`uci get system.@system[0].server`, function (err, data, stderr) {
			localTunnelServer = data.trim();
			
			if (isValidURL(localTunnelServer)) {
				
				setInterval(function () { 
					try {
						if (!isForwardActive) {
							localtunnel(localTunnelPort, {'host': localTunnelServer}, function(err, tunnel) {
								if (err) { isForwardActive = false; localTunnelAddress = '-'; }

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
	}
});


process.on('uncaughtException', function (err) {
    isForwardActive = false;
	localTunnelAddress = '-';
});

/**
* Set constants for app
*/
const KEY_NONE = 0x00;
const KEY_ERR_UNDEFINED = 0x03; // keyboard codes 0x01, 0x02, 0x03 detect corresponding error events

const KEY_MOD_LCTRL = 0x01
const KEY_MOD_LSHIFT = 0x02
const KEY_MOD_LALT = 0x04
const KEY_MOD_LMETA = 0x08
const KEY_MOD_RCTRL = 0x10
const KEY_MOD_RSHIFT = 0x20
const KEY_MOD_RALT = 0x40
const KEY_MOD_RMETA = 0x80

const KEY_CAPSLOCK = 0x39
const KEY_NUMLOCK = 0x53
const KEY_SCROLLLOCK = 0x47

var KEY_LED_OFFSET = {};
KEY_LED_OFFSET[KEY_NUMLOCK] = 0x01;
KEY_LED_OFFSET[KEY_CAPSLOCK] = 0x02;
KEY_LED_OFFSET[KEY_SCROLLLOCK] = 0x04;


const INTERVAL = 200; // interval to send queued buffer
const DATA_OFFSET = 2; // offset from buffer which indicates first data byte position
const MODIFIER_BYTE_OFFSET = 0; // position of the modifier byte
const SCAN_PREFIX = [0x0225, 0x0225]; // scan codes of prefix to detect a barcode scanner
const SCAN_SUFFIX = [0x28]; // scan codes of suffix to send data of a barcode scanner

/**
* Set variables
*/
var hidDevices = {}; // dictionary of active HID devices
var bufferToSend = []; // buffer to send data to server
var previousData = null; // previous buffer data to compare with current buffer
var urlSendBuffer = '/cgi/tcpkeyboard'; // URI to send buffer
var urlSendBufferScanner = '/cgi/tcpscanner'; // URI to send a buffer from a scanner
var ledKeys = [KEY_CAPSLOCK, KEY_NUMLOCK, KEY_SCROLLLOCK]; // keys corresponding to LEDs
var bufferPressed = []; // buffer that contains all current pressed keys
var isScanner = false; // flag that indicates scanning process
var isPossibleScanner = false; // flag that indicates the first symbol of a scan code prefix
var isAllowedToSend = true; // flag that indicates the possibility to send data using the time interval

/**
* Define functions
*/
/* Transform HEX string to an integer value */
var getProductInfoItem = function(position) {
	position = "0x" + position;
	return parseInt(position);
};

/* Find the count of non-empty slots inside a buffer */
var getValuableSlotsCount = function (buffer) {
	var i;
	var count = 0;
	
	/* loop through buffer from the data offset */
	for (i = DATA_OFFSET; i < buffer.length; i++) {
		if (buffer[i] > KEY_ERR_UNDEFINED) {
			count++;
		}
	}
	return count;
};

/* Send all current buffer data
 * @isScanner - flag to check if scanner or keyboard data should be sent
 */
var sendAllBuffer = function (isScanner) {
	if (bufferToSend.length > 0) {
		dataSend = bufferToSend.slice();
		bufferToSend = bufferToSend.slice(dataSend.length);
		sendBuffer(dataSend, isScanner).then(function() {	
		});
	}
};

/* Send buffer data */
var sendBuffer = function(bufferQueue, isScanner) {
	
	// Select URI due to source type
	var url = urlSendBuffer;
	if (isScanner) {
		url = urlSendBufferScanner;
	}
	return new Promise(function (resolve, reject) {
        client.runRequest(url, 'POST', bufferQueue, {
            json: true,
			timeout: 1000,
            headers: {
                'X-HTTP-Method-Override': 'PATCH'
            }
        }).then(function () {
            resolve();
        }, function (err) {
            resolve(err);
        });
    });
};

/* Check if buffer consists of zeros */
var isBufferZeroFilled = function (buf) {
	var isZeroFilled = true;
	var i = 0;
	for (i = 0; i < buf.length; i++) {
		if (buf[i] != 0x00) {
			isZeroFilled = false;
		}
	}
	return isZeroFilled;
};

/* Convert number to zero padded string */
var toPaddedHexString = function (num, len) {
	str = num.toString(16);
    return "0".repeat(len - str.length) + str;
};

/* Callback for data recieve from the device */
var onDataRecieve = function (data) {
	
	/* Get the modifier byte and the first data slot */
	var firstKey = data[DATA_OFFSET];
	var modifierByte = data[MODIFIER_BYTE_OFFSET];
	
	var device = this;
	
	var isNecessaryToPush = false;
	var valuableKey = firstKey;
	
	/*
	* Check if all buttons have been released or not 
	*/
	if (isBufferZeroFilled(data)) {
		/*
		* Loop through buffer and check if just modifiers keys were pressed before release
		*/
		var modifierKey = -1;
		var isModifiersOnly = true;
		bufferPressed.forEach(function(buf) {
			if (buf[DATA_OFFSET] > KEY_ERR_UNDEFINED) {
				isModifiersOnly = false;
			}
			else {
				if (modifierKey < buf[MODIFIER_BYTE_OFFSET]) {
					modifierKey = buf[MODIFIER_BYTE_OFFSET];
				}
			}
		});
		if (isModifiersOnly) {
			isNecessaryToPush = true;
			valuableKey = 0x00;
			modifierByte = modifierKey;
		}
		bufferPressed = [];
	}
	else {
		bufferPressed.push(data);
	}
	
	
	/* If the data key slot doesn't contain an error value 
	*  than check if new key was pressed
	*/
	if (firstKey > KEY_ERR_UNDEFINED) {
		
		if (previousData != null) {
			/* Check if new position has been found inside the buffer
			*  comparing with previous buffer
			* Also check if current buffer and previous buffer are different to avoid duplications
			*/
			var slotCountData = getValuableSlotsCount(data);
			var slotCountPrevData = getValuableSlotsCount(previousData);
			
			if (slotCountData >= slotCountPrevData && Buffer.compare(data, previousData) != 0) {
				valuableKey = data[DATA_OFFSET + slotCountData - 1];
				isNecessaryToPush = true;
			}
		}
		else {
			isNecessaryToPush = true;
			previousData = data;
		}
	}
	if (isNecessaryToPush) {
		
		/*
		* Check if some of LED buttons has been pressed
		* than refresh current led status of the keyboard and send signal to turn on/off LED
		*/
		if (ledKeys.indexOf(valuableKey) > -1) {
			device.ledStatus = device.ledStatus ^ KEY_LED_OFFSET[valuableKey];
			
			// Turn on/off LED
			// LED status consists of the single byte
			device.write([0x00, device.ledStatus]);
		}
		
		// Prepare number to send. Number consists of 3 bytes
		// First byte - LED status, second byte - modifier byte, third byte - valuable key
		var sendByte = parseInt("0x" + toPaddedHexString(modifierByte, 2) + toPaddedHexString(valuableKey, 2));
		
		// If scanner mode is turned on
		if (isScanner) {
			
			// Check if the end mark of a code is detected
			if (sendByte == SCAN_SUFFIX[0]) {
				
				// Send code to the URI of scanner
				// Reset variables and resume background data sent
				sendAllBuffer(true);
				isScanner = false;
				isAllowedToSend = true;
			}
			else {
				
				// Push code to the buffer
				bufferToSend.push(sendByte);
			}
		}
		else {
			
			// If the first symbol of the prefix was previously detected
			if (isPossibleScanner) {
			
				// Check if the next symbol also coincides with a prefix pattern and turn on scanner mode
				if (sendByte == SCAN_PREFIX[1]) {
					isScanner = true;
				}
				else {
					
					// Push the first prefix symbol and the current symbol to the buffer
					bufferToSend.push(SCAN_PREFIX[0]);
					bufferToSend.push(sendByte);
					isAllowedToSend = true;
				}
				isPossibleScanner = false;
			}
			else {
				
				// Check if the current symbol equals to the first prefix symbol
				if (sendByte == SCAN_PREFIX[0]) {
					
					// Detect the possible scanner mode
					isPossibleScanner = true;
					isAllowedToSend = false;
					
					// Send all current buffer to free it
					sendAllBuffer();
				}
				else {
					
					if (!isNaN(sendByte)) {
						// Add the current symbol to the buffer
						bufferToSend.push(sendByte);
					}
				}
			}
		}
	}
	previousData = data;
}

/* Attempt to register new device */
var registerDeviceAttempt = function (vendorId, productId, path, usbHidID, repeat) {
	var hidDevice;
	if (repeat) {
		hidDevice = new HID.HID(path);
	}
	else {
		hidDevice = new HID.HID(vendorId, productId);
	}
	hidDevice.on("data", onDataRecieve);
	hidDevice.on("error", function() {});
	hidDevices[usbHidID] = hidDevice;
	hidDevice.ledStatus = 0x00;
	bufferToSend.push(parseInt("0x00"));
};

// Try to register new HID device
var registerNewDevice = function (vendorId, productId, path) {
	var usbHidID = vendorId + productId;
	try {
		registerDeviceAttempt(vendorId, productId, path, usbHidID);
	}
	catch (error) {
		try {
			registerDeviceAttempt(vendorId, productId, path, usbHidID, true);
		}
		catch (error) { 
		}
	}
};

/* Reregister all devices */
var reloadHIDDevices = function () {
	
	delete hidDevices;
	
	// Collect all existing HID devices and register them
	var hDevices = HID.devices();
	hDevices.forEach(function (hDevice) {
		registerNewDevice(hDevice.vendorId, hDevice.productId, hDevice.path);
	});
};

// Get avaialble devices from the startup
reloadHIDDevices();


// Start monitoring of USB devices
usbDetect.startMonitoring();
 
// Detect add device event
usbDetect.on('add', function(device) {
	
	// Close all current devices
	for (deviceID in hidDevices) {
		hidDevices[deviceID].close();
	}
	
	// Reload all HID devices
	reloadHIDDevices();
	
	/* Try to define HID device and init event listeners */
	//registerNewDevice(device.vendorId, device.productId);
});

// Detect remove device event
usbDetect.on('remove', function(device) {
	try {
		var usbHidID = device.vendorId + device.productId;
		if (usbHidID in hidDevices) {
			var hidDevice = hidDevices[usbHidID];
			hidDevice.close();
			delete hidDevices[usbHidID];
		}
	}
	catch (error) {}
});

// Variable that indicates the previous 'allowed' state for sending
var prevIntervalState = true;

// Send queued buffer data
setInterval(function() {
	
	// Check if it is not allowed to send and the previous attempt also failed
	if (!isAllowedToSend && !prevIntervalState) {
		
		// Allow to send and resent scan prefixes
		isAllowedToSend = true;
		if (isPossibleScanner) {
			bufferToSend.push(SCAN_PREFIX[0]);
		}
		if (isScanner) {
			bufferToSend.push(SCAN_PREFIX[0]);
			bufferToSend.push(SCAN_PREFIX[1]);
		}
		isPossibleScanner = false;
		isScanner = false;
	}
	if (bufferToSend.length > 0 && isAllowedToSend) {
		sendAllBuffer();
	}
	prevIntervalState = isAllowedToSend;
}, INTERVAL);
