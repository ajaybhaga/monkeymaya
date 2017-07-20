/**

Monkey Maya Video Processing Engine
Author: Ajay Bhaga

The MIT License (MIT)

Copyright (c) 2017 Ajay Bhaga

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

**/

'use strict';

const port = 3000;
var conString = "postgresql://monkey:@pple123@localhost/monkeymaya";

var keywords = [];
var cache = require('js-cache');
var gifCache = new cache();
var videoDataCache = new cache();

const express = require('express');
const app = express();
var pg = require('pg');
var http = require('http');
var request = require('request');

var Q = require('q');

// Include the public functions from 'libs.js'
var libs = require('./libs.js');
var corelib = libs.corelib;
//console.log('Available export methods: ', corelib);
corelib.loadLib();
var imgNum = 0;
var genNum = 0;

function progressBar(text, total, i) {
  var itemsLeft = (total-i);
  var pBar = '';
  var completed = (itemsLeft/total);
  pBar += '[';

  for (var p = 0; p < 10-Math.round(10*completed);  p++) {
    pBar += '|';
  }

  for (var p = 0; p < (10*completed);  p++) {
    pBar += ' ';
  }
  pBar += ']';

  pBar += ' ' + (100-Math.round(100*completed)) + '%';

  var pText =  pBar;
  Logger.info(text + ': ' + pText);

  return itemsLeft;
}

function fetchGifURL(keyword) {

    console.log('| Fetching gif url for keyword: ', keyword, '|');

    var q = keyword; // search query

    request('http://api.giphy.com/v1/gifs/random?api_key=dc6zaTOxFJmzC&tag='+q, function (error, response, body) {
      console.log('error:', error); // Print the error if one occurred
      console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
      //console.log('body:', body); // Print the HTML for the Google homepage.
      console.log('Retrieving gif from giphy.');
          if (response.statusCode >= 200 && response.statusCode < 400) {
            var urlData = JSON.parse(body).data.image_url;
            console.log(keyword + ', URL = ' + urlData);
            storeURL(keyword, urlData);

            var inputFile = urlData;
            console.log('Loading lib with', inputFile);
            imgNum++;
            return corelib.loadGif(inputFile, keyword);
            //if (imgNum == 1) {

            //}

            //console.log('data = ', data);
          }
    });
}

var loadKeywords = function(res) {
    console.log('Loading keywords from database.');

    var sqltext = 'SELECT KEYWORD FROM MM_CONTROL WHERE KEYWORD = \'crazy\'';
    pg.connect(conString, function(err, client, done) {
        if(err) {
            console.error('error fetching client from pool', err);
        } else {

          var query = client.query(sqltext, function(err, result) {
              done();
              if(err) {
                  console.error('error running query', err);
              }
          });

        	var keyword = 'N/A';

        	query.on('row', function(row, res) {
        	/*CODE*/

        		keywords.push(row.keyword);
            console.log('Loaded keyword: ', row.keyword);
        	});

        	query.on('end', function(result) {
        		console.log(result.rowCount + ' rows were received.');
            if (res) {
        		    res.send('[Monkey Maya Service] keywords received ' + keywords.length);
            }

            for (var i = 0; i < keywords.length; i++) {
              fetchGifURL(keywords[i]);
            }
        	});
        }
      })


      // Load next set also
      //loadNextSet();
}

var loadNextSet = function() {
  for (var i = 0; i < keywords.length; i++) {
    fetchGifURL(keywords[i]);
  }
}

var storeURL = function(keyword, url) {
    var count = 1;

    var key = keyword + count;
    var urlList = gifCache.get(key);
    console.log('urlList = ', urlList);
    if (typeof urlList == 'undefined') {
        urlList = [];
        console.log('Creating new url list.');
    } else {
      console.log('URL list exists.');
    }

    count = urlList.length + 1;
    var key = keyword + count;
    // Store url in list
    urlList.push(url);
    gifCache.set(key, urlList, 60000);

    urlList = gifCache.get(key);
    console.log(keyword + ' has ' + urlList.length + ' url(s) stored.');

    //console.log(gifCache);
}



// Load keywords (from db)
//loadKeywords(null);
// Manual keyword
var keyword = 'blissful';
/*keywords.push('blissful');
keywords.push('dreamy');
keywords.push('defeated');
keywords.push('furious');
keywords.push('psychedelic');
keywords.push('sexy');
keywords.push('seductive');
keywords.push('euphoric');*/
keywords.push('raging');
keywords.push('vibrant');

// Single rneder
Q.fcall(function () { fetchGifURL(keywords[0]) });//.then(Q.fcall(function () { fetchGifURL(keywords[1]) }));


//fetchGifURL(keywords[0]).then(fetchGifURL(keywords[1]));

/*
var funcs = [];
for (var i in keywords) {
  var keyword = keywords[i];
  funcs.push(fetchGifURL(keyword));
}


var result = Q(0);
funcs.forEach(function (f) {
    result = result.then(f);
});*/
//return result;


//console.log('Available export methods: ', corelib);

//var vertex = new libs.FSS.Vertex(0, 0, 0);
/*
function testLoad() {
  //libs.serverMethod1();
  // Call lib method
  var a = new libs.FSS.Color();
}

testLoad();
*/



app.get('/', function (req, res) {
//# res.send('Monkey Maya Service!')
  loadKeywords(res);
})

app.get('/list', function (req, res) {
//# res.send('Monkey Maya Service!')
  loadNextSet();
})

app.get('/events', function (req, res) {
res.send('Events')
})


app.listen(port, function () {
console.log('Monkey Maya Engine: Listening on port ' + port +  '.')
})

app.on('error', function(err) {
console.log(err);
})

/*
server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});*/
