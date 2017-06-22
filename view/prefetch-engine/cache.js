var cache = require('js-cache');
cache.set('lorem', 'ipsum', 60000);
console.log(cache.get('lorem'));

var myCache = new cache();
myCache.set('lorem', 'dolor', 60000);
console.log(myCache.get('lorem'));
