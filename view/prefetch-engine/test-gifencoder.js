var GIFEncoder = require('gifencoder');
var Canvas = require('canvas');
var fs = require('fs');

function getRandomArbitrary(min, max) {
  return Math.random() * (max - min) + min;
}

var bufferWidth = 1280;
var bufferHeight = 1024;

var encoder = new GIFEncoder(bufferWidth, bufferHeight);
// stream the results as they are available into myanimated.gif
encoder.createReadStream().pipe(fs.createWriteStream('myanimated.gif'));

encoder.start();
encoder.setRepeat(0);  // 0 for repeat, -1 for no-repeat
encoder.setDelay(50);  // frame delay in ms
encoder.setQuality(10); // image quality. 10 is default.

for (var j = 0; j < 4; j++) {

  var pixels = [];
  for(var i=0; i<(bufferWidth * bufferHeight*4); i+=4) {
    //for(var j=0; j<3; ++j) {
    pixels[i+0] = getRandomArbitrary(0,255);
    pixels[i+1] = getRandomArbitrary(0,255);
    pixels[i+2] = getRandomArbitrary(0,255);
    pixels[i+3] = 0;
    //}
  }

  console.log('Rendering Frame', (j+1));
  // Write out the image into memory
  encoder.addFrame(pixels);
}

encoder.finish();
