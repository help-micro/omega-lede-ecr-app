var HID = require('node-hid');
var client = require('./client');
var common = require('./common');


/**
* Set URL in client
*/
url = 'http://' + common.ip;
client.setUrl(url);

const KEY_NONE = 0x00;
const KEY_ERR_UNDEFINED = 0x03;

const KEY_MOD_LCTRL = 0x01
const KEY_MOD_LSHIFT = 0x02
const KEY_MOD_LALT = 0x04
const KEY_MOD_LMETA = 0x08
const KEY_MOD_RCTRL = 0x10
const KEY_MOD_RSHIFT = 0x20
const KEY_MOD_RALT = 0x40
const KEY_MOD_RMETA = 0x80


const INTERVAL = 200;
const DATA_OFFSET = 2;
const MODIFIER_BYTE_OFFSET = 0;

var getProductInfoItem = function(position) {
	position = "0x" + position;
	return parseInt(position);
};

var getValuableSlotsCount = function (buffer) {
	var i;
	var count = 0;
	for (i = DATA_OFFSET; i < buffer.length; i++) {
		if (buffer[i] > KEY_ERR_UNDEFINED) {
			count++;
		}
	}
	return count;
};

var sendBuffer = function(bufferQueue) {
	return new Promise(function (resolve, reject) {
        client.runRequest('/index2.php', 'POST', bufferQueue, {
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

//console.log(HID.devices());

var PRODUCT = process.argv[2];
var productInfo = PRODUCT.split('/');
var vid = getProductInfoItem(productInfo[0]);
var pid = getProductInfoItem(productInfo[1]);

var device = new HID.HID(vid, pid);
console.log('Device is opened');
var buffer = [];
var bufferToSend = [];
var previousData = null;

device.on("data", function(data) {
	//console.log(data);
	var firstKey = data[DATA_OFFSET];
	var modifierByte = data[MODIFIER_BYTE_OFFSET];
	var isNecessaryToPush = false;
	var valuableKey = firstKey;
	if (firstKey > KEY_ERR_UNDEFINED) {
		if (previousData != null) {
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
});

setInterval(function() {
	if (bufferToSend.length > 0) {
		dataSend = bufferToSend.slice();
		sendBuffer(dataSend).then(function() {
			bufferToSend = bufferToSend.slice(dataSend.length);
		});
	}
}, INTERVAL);
