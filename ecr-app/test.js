var zip = new require('node-zip')();
var fs = require("fs");
zip.file('test.txt', 'hello there');
var data = zip.generate({base64:false,compression:'DEFLATE'});
try {
	fs.writeFileSync('/tmp/run/mountd/sda1/test.zip', data, 'binary');
}
catch (ex) {
	console.log(ex);
}