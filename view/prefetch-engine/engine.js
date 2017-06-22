'use strict';

const port = 3000;
var conString = "postgresql://monkey:@pple123@localhost/monkeymaya";

//const cache = require('./cache.js')
var keywords = [];
var cache = require('js-cache');
var gifCache = new cache();
var videoDataCache = new cache();

const express = require('express');
const app = express();
var pg = require('pg');
var http = require('http');


function fetchGifURL(keyword) {
  console.log('Fetching gif url for keyword: ', keyword);

  var q = keyword; // search query

  var request = require('request');
  request('http://api.giphy.com/v1/gifs/random?api_key=dc6zaTOxFJmzC&tag='+q, function (error, response, body) {
    console.log('error:', error); // Print the error if one occurred
    console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
    //console.log('body:', body); // Print the HTML for the Google homepage.
    console.log('Retrieving gif from giphy.');
        if (response.statusCode >= 200 && response.statusCode < 400) {
          var urlData = JSON.parse(body).data.image_url;

          console.log(keyword + ', URL = ' + urlData);
          storeURL(keyword, urlData);

          //return data;
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
              var url = fetchGifURL(keywords[i]);
            }
        	});
        }
      })
}

var loadNextSet = function() {
  for (var i = 0; i < keywords.length; i++) {
    var url = fetchGifURL(keywords[i]);
  }

}

var storeURL = function(keyword, url) {
    var count = 1;

    var urlList = gifCache.get(keyword);
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
}

var fetchGifs = function() {
  for (var i = 0; i < keywords.length; i++) {
    console.log('Fetching gifs.');
    var videoKey = keywords[i] + ''
    videoCache.set(videoKey, 'ipsum', 60000);
    console.log(cache.get('lorem'));
  }
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
