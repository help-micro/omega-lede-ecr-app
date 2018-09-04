var Service = require('node-service-linux').Service;
var path = require('path');

// Create a new service object
var svc = new Service({
    name: 'Help Micro',
    script: __dirname + path.sep + 'app.js'
});

// Listen for the "uninstall" event so we know when it's done.
svc.on('uninstall',function(){
    console.log('Uninstall complete.');
    console.log('The service exists: ',svc.exists());
});

// Uninstall the service.
svc.uninstall();