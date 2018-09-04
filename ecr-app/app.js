var undefined;

global.ip = "192.168.8.100"

var report = require('./report.js');

var commonErrorMessage = "Device is offline";

// Global variable to check if the processing ability is locked
global.isLocked = false;

// Timeout interval to examine the cash register
var interval = 3000;

setInterval(function () {
	report.setIPAddress(global.ip);
	if (!global.isLocked) {
		global.isLocked = true;
		report.getCurrentANAFState().then(function (state) {
			report.processANAFState(state).then(function (message) {
				console.log(message);
			}, function (errorMessage) {
				if (errorMessage == undefined) {
					errorMessage = commonErrorMessage;
				}
				console.log(errorMessage);
			})
			// Always handler
				.then(function () {
					global.isLocked = false;

				});
		}, function () {
			console.log(commonErrorMessage);
			global.isLocked = false;
		});
	}
    
}, interval);