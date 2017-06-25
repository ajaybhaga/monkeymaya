var fs = require('fs');
var gifyParse = require('gify-parse');

var buffer = fs.readFileSync('test.gif');
var gifInfo = gifyParse.getInfo(buffer);

console.log(gifInfo);
