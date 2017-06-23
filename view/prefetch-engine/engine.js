/*
  Monkey Maya Video Processing Engine v0.1
  Author: Ajay Bhaga
*/
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

// Include the public functions from 'libs.js'
var libs = require('./libs.js');
console.log(libs.corelib.supertriangle());

/*
var delaunay = require('./js/delaunay.js');
var Core = require('./js/Core.js');
var Math = require('./js/Math.js');
var Vector3 = require('./js/Vector3.js');
var Vector4 = require('./js/Vector4.js');
var Color = require('./js/Color.js');
var Object = require('./js/Object.js');
var Light = require('./js/Light.js');
var Vertex = require('./js/Vertex.js');
var Triangle = require('./js/Triangle.js');
var Geometry = require('./js/Geometry.js');
var Plane = require('./js/Plane.js');
var Material = require('./js/Material.js');
var Mesh = require('./js/Mesh.js');
var Scene = require('./js/Scene.js');
var loadgif = require('./js/loadgif.js');
*/
var vertex = new libs.FSS.Vertex(0, 0, 0);
/*
function testLoad() {
  //libs.serverMethod1();
  // Call lib method
  var a = new libs.FSS.Color();
}

testLoad();
*/

function fetchGifURL(keyword) {
  console.log('Fetching gif url for keyword: ', keyword);

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
          //console.log('data = ', data);
        }
  });
}

var loadKeywords = function(req, res) {
    console.log('Loading keywords from database.');

    var sqltext = 'SELECT KEYWORD FROM MM_CONTROL';
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
        		res.send('[Monkey Maya Service] keywords received ' + keywords.length);

            for (var i = 0; i < keywords.length; i++) {
              fetchGifURL(keywords[i]);
            }
        	});
        }
      })
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

app.get('/', function (req, res) {
//# res.send('Monkey Maya Service!')
  loadKeywords(req, res);
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
