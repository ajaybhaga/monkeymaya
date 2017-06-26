/**

Monkey Maya Video Processing Engine: Core Library
Author: Ajay Bhaga

The MIT License (MIT)

Copyright (c) 2014

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

Thanks to Maksim Surguy for portions of base code.

**/
(function() {
  "use strict";

  // xvfb buffer: 1280x1024x24
  var bufferWidth = 1280;
  var bufferHeight = 1024;

  var gifData = {
    frames: [],
    width: 0,
    height: 0
  }

  // Log messages will be written to the window's console.
  var Logger = require('js-logger');
  var request = require('request');
  var GIFEncoder = require('gifencoder');
  var Canvas = require('canvas');
  var fs = require('fs');
  var gl = require('gl')(bufferWidth, bufferHeight, { preserveDrawingBuffer: true });
  var gifyParse = require('gify-parse');
  var getPixels = require("get-pixels");

  exports.gl = gl;

  var canvas = new Canvas(bufferWidth, bufferHeight);
  // use node-canvas
  var ctx = canvas.getContext('2d');
  var Image = Canvas.Image;
  var encoder = new GIFEncoder(bufferWidth, bufferHeight);

  function getRandomArbitrary(min, max) {
    return Math.round(Math.random() * (max - min) + min);
  }

  var version = 0.1;
  Logger.useDefaults();
  Logger.info('Monkey Maya Video Processing Engine v' + version);

  var img = {
    preview: null,
    canvas: null,
    context: null,
    grayscale: null,
    loaded: false
  }

  var EPSILON = 1.0 / 1048576.0;

  function supertriangle(vertices) {
    var xmin = Number.POSITIVE_INFINITY,
        ymin = Number.POSITIVE_INFINITY,
        xmax = Number.NEGATIVE_INFINITY,
        ymax = Number.NEGATIVE_INFINITY,
        i, dx, dy, dmax, xmid, ymid;

    for(i = vertices.length; i--; ) {
      if(vertices[i][0] < xmin) xmin = vertices[i][0];
      if(vertices[i][0] > xmax) xmax = vertices[i][0];
      if(vertices[i][1] < ymin) ymin = vertices[i][1];
      if(vertices[i][1] > ymax) ymax = vertices[i][1];
    }

    dx = xmax - xmin;
    dy = ymax - ymin;
    dmax = Math.max(dx, dy);
    xmid = xmin + dx * 0.5;
    ymid = ymin + dy * 0.5;

    return [
      [xmid - 20 * dmax, ymid -      dmax],
      [xmid            , ymid + 20 * dmax],
      [xmid + 20 * dmax, ymid -      dmax]
    ];
  }
  exports.supertriangle = supertriangle;

  function circumcircle(vertices, i, j, k) {
    var x1 = vertices[i][0],
        y1 = vertices[i][1],
        x2 = vertices[j][0],
        y2 = vertices[j][1],
        x3 = vertices[k][0],
        y3 = vertices[k][1],
        fabsy1y2 = Math.abs(y1 - y2),
        fabsy2y3 = Math.abs(y2 - y3),
        xc, yc, m1, m2, mx1, mx2, my1, my2, dx, dy;

    /* Check for coincident points */
    if(fabsy1y2 < EPSILON && fabsy2y3 < EPSILON)
      throw new Error("Eek! Coincident points!");

    if(fabsy1y2 < EPSILON) {
      m2  = -((x3 - x2) / (y3 - y2));
      mx2 = (x2 + x3) / 2.0;
      my2 = (y2 + y3) / 2.0;
      xc  = (x2 + x1) / 2.0;
      yc  = m2 * (xc - mx2) + my2;
    }

    else if(fabsy2y3 < EPSILON) {
      m1  = -((x2 - x1) / (y2 - y1));
      mx1 = (x1 + x2) / 2.0;
      my1 = (y1 + y2) / 2.0;
      xc  = (x3 + x2) / 2.0;
      yc  = m1 * (xc - mx1) + my1;
    }

    else {
      m1  = -((x2 - x1) / (y2 - y1));
      m2  = -((x3 - x2) / (y3 - y2));
      mx1 = (x1 + x2) / 2.0;
      mx2 = (x2 + x3) / 2.0;
      my1 = (y1 + y2) / 2.0;
      my2 = (y2 + y3) / 2.0;
      xc  = (m1 * mx1 - m2 * mx2 + my2 - my1) / (m1 - m2);
      yc  = (fabsy1y2 > fabsy2y3) ?
        m1 * (xc - mx1) + my1 :
        m2 * (xc - mx2) + my2;
    }

    dx = x2 - xc;
    dy = y2 - yc;
    return {i: i, j: j, k: k, x: xc, y: yc, r: dx * dx + dy * dy};
  }
  exports.circumcircle = circumcircle;

  function dedup(edges) {
    var i, j, a, b, m, n;

    for(j = edges.length; j; ) {
      b = edges[--j];
      a = edges[--j];

      for(i = j; i; ) {
        n = edges[--i];
        m = edges[--i];

        if((a === m && b === n) || (a === n && b === m)) {
          edges.splice(j, 2);
          edges.splice(i, 2);
          break;
        }
      }
    }
  }
  exports.dedup = dedup;

  var Delaunay = {
    triangulate: function(vertices, key) {
      var n = vertices.length,
          i, j, indices, st, open, closed, edges, dx, dy, a, b, c;

      /* Bail if there aren't enough vertices to form any triangles. */
      if(n < 3)
        return [];

      /* Slice out the actual vertices from the passed objects. (Duplicate the
       * array even if we don't, though, since we need to make a supertriangle
       * later on!) */
      vertices = vertices.slice(0);

      if(key)
        for(i = n; i--; )
          vertices[i] = vertices[i][key];

      /* Make an array of indices into the vertex array, sorted by the
       * vertices' x-position. */
      indices = new Array(n);

      for(i = n; i--; )
        indices[i] = i;

      indices.sort(function(i, j) {
        return vertices[j][0] - vertices[i][0];
      });

      /* Next, find the vertices of the supertriangle (which contains all other
       * triangles), and append them onto the end of a (copy of) the vertex
       * array. */
      st = supertriangle(vertices);
      vertices.push(st[0], st[1], st[2]);

      /* Initialize the open list (containing the supertriangle and nothing
       * else) and the closed list (which is empty since we havn't processed
       * any triangles yet). */
      open   = [circumcircle(vertices, n + 0, n + 1, n + 2)];
      closed = [];
      edges  = [];

      /* Incrementally add each vertex to the mesh. */
      for(i = indices.length; i--; edges.length = 0) {
        c = indices[i];

        /* For each open triangle, check to see if the current point is
         * inside it's circumcircle. If it is, remove the triangle and add
         * it's edges to an edge list. */
        for(j = open.length; j--; ) {
          /* If this point is to the right of this triangle's circumcircle,
           * then this triangle should never get checked again. Remove it
           * from the open list, add it to the closed list, and skip. */
          dx = vertices[c][0] - open[j].x;
          if(dx > 0.0 && dx * dx > open[j].r) {
            closed.push(open[j]);
            open.splice(j, 1);
            continue;
          }

          /* If we're outside the circumcircle, skip this triangle. */
          dy = vertices[c][1] - open[j].y;
          if(dx * dx + dy * dy - open[j].r > EPSILON)
            continue;

          /* Remove the triangle and add it's edges to the edge list. */
          edges.push(
            open[j].i, open[j].j,
            open[j].j, open[j].k,
            open[j].k, open[j].i
          );
          open.splice(j, 1);
        }

        /* Remove any doubled edges. */
        dedup(edges);

        /* Add a new triangle for each edge. */
        for(j = edges.length; j; ) {
          b = edges[--j];
          a = edges[--j];
          open.push(circumcircle(vertices, a, b, c));
        }
      }

      /* Copy any remaining open triangles to the closed list, and then
       * remove any triangles that share a vertex with the supertriangle,
       * building a list of triplets that represent triangles. */
      for(i = open.length; i--; )
        closed.push(open[i]);
      open.length = 0;

      for(i = closed.length; i--; )
        if(closed[i].i < n && closed[i].j < n && closed[i].k < n)
          open.push(closed[i].i, closed[i].j, closed[i].k);

      /* Yay, we're done! */
      return open;
    },
    contains: function(tri, p) {
      /* Bounding box test first, for quick rejections. */
      if((p[0] < tri[0][0] && p[0] < tri[1][0] && p[0] < tri[2][0]) ||
         (p[0] > tri[0][0] && p[0] > tri[1][0] && p[0] > tri[2][0]) ||
         (p[1] < tri[0][1] && p[1] < tri[1][1] && p[1] < tri[2][1]) ||
         (p[1] > tri[0][1] && p[1] > tri[1][1] && p[1] > tri[2][1]))
        return null;

      var a = tri[1][0] - tri[0][0],
          b = tri[2][0] - tri[0][0],
          c = tri[1][1] - tri[0][1],
          d = tri[2][1] - tri[0][1],
          i = a * d - b * c;

      /* Degenerate tri. */
      if(i === 0.0)
        return null;

      var u = (d * (p[0] - tri[0][0]) - b * (p[1] - tri[0][1])) / i,
          v = (a * (p[1] - tri[0][1]) - c * (p[0] - tri[0][0])) / i;

      /* If we're outside the tri, fail. */
      if(u < 0.0 || v < 0.0 || (u + v) > 1.0)
        return null;

      return [u, v];
    }
  };

  //if(typeof module !== "undefined")
    //module.exports = Delaunay;
    exports.Delaunay = Delaunay;
//

/**
 * Defines the Flat Surface Shader namespace for all the awesomeness to exist upon.
 * @author Matthew Wagerfield
 */
var FSS = {
  FRONT  : 0,
  BACK   : 1,
  DOUBLE : 2,
  SVGNS  : 'http://www.w3.org/2000/svg'
};

/**
 * @class Array
 * @author Matthew Wagerfield
 */
FSS.Array = typeof Float32Array === 'function' ? Float32Array : Array;

/**
 * @class Utils
 * @author Matthew Wagerfield
 */
FSS.Utils = {
  isNumber: function(value) {
    return !isNaN(parseFloat(value)) && isFinite(value);
  }
};

/**
 * @object Math Augmentation
 * @author Matthew Wagerfield
 */
Math.PIM2 = Math.PI*2;
Math.PID2 = Math.PI/2;
Math.randomInRange = function(min, max) {
  return min + (max - min) * Math.random();
};
Math.clamp = function(value, min, max) {
  value = Math.max(value, min);
  value = Math.min(value, max);
  return value;
};

/**
 * @object Vector3
 * @author Matthew Wagerfield
 */
FSS.Vector3 = {
  create: function(x, y, z) {
    var vector = new FSS.Array(3);
    this.set(vector, x, y, z);
    return vector;
  },
  clone: function(a) {
    var vector = this.create();
    this.copy(vector, a);
    return vector;
  },
  set: function(target, x, y, z) {
    target[0] = x || 0;
    target[1] = y || 0;
    target[2] = z || 0;
    return this;
  },
  setX: function(target, x) {
    target[0] = x || 0;
    return this;
  },
  setY: function(target, y) {
    target[1] = y || 0;
    return this;
  },
  setZ: function(target, z) {
    target[2] = z || 0;
    return this;
  },
  copy: function(target, a) {
    target[0] = a[0];
    target[1] = a[1];
    target[2] = a[2];
    return this;
  },
  add: function(target, a) {
    target[0] += a[0];
    target[1] += a[1];
    target[2] += a[2];
    return this;
  },
  addVectors: function(target, a, b) {
    target[0] = a[0] + b[0];
    target[1] = a[1] + b[1];
    target[2] = a[2] + b[2];
    return this;
  },
  addScalar: function(target, s) {
    target[0] += s;
    target[1] += s;
    target[2] += s;
    return this;
  },
  subtract: function(target, a) {
    target[0] -= a[0];
    target[1] -= a[1];
    target[2] -= a[2];
    return this;
  },
  subtractVectors: function(target, a, b) {
    target[0] = a[0] - b[0];
    target[1] = a[1] - b[1];
    target[2] = a[2] - b[2];
    return this;
  },
  subtractScalar: function(target, s) {
    target[0] -= s;
    target[1] -= s;
    target[2] -= s;
    return this;
  },
  multiply: function(target, a) {
    target[0] *= a[0];
    target[1] *= a[1];
    target[2] *= a[2];
    return this;
  },
  multiplyVectors: function(target, a, b) {
    target[0] = a[0] * b[0];
    target[1] = a[1] * b[1];
    target[2] = a[2] * b[2];
    return this;
  },
  multiplyScalar: function(target, s) {
    target[0] *= s;
    target[1] *= s;
    target[2] *= s;
    return this;
  },
  divide: function(target, a) {
    target[0] /= a[0];
    target[1] /= a[1];
    target[2] /= a[2];
    return this;
  },
  divideVectors: function(target, a, b) {
    target[0] = a[0] / b[0];
    target[1] = a[1] / b[1];
    target[2] = a[2] / b[2];
    return this;
  },
  divideScalar: function(target, s) {
    if (s !== 0) {
      target[0] /= s;
      target[1] /= s;
      target[2] /= s;
    } else {
      target[0] = 0;
      target[1] = 0;
      target[2] = 0;
    }
    return this;
  },
  cross: function(target, a) {
    var x = target[0];
    var y = target[1];
    var z = target[2];
    target[0] = y*a[2] - z*a[1];
    target[1] = z*a[0] - x*a[2];
    target[2] = x*a[1] - y*a[0];
    return this;
  },
  crossVectors: function(target, a, b) {
    target[0] = a[1]*b[2] - a[2]*b[1];
    target[1] = a[2]*b[0] - a[0]*b[2];
    target[2] = a[0]*b[1] - a[1]*b[0];
    return this;
  },
  min: function(target, value) {
    if (target[0] < value) { target[0] = value; }
    if (target[1] < value) { target[1] = value; }
    if (target[2] < value) { target[2] = value; }
    return this;
  },
  max: function(target, value) {
    if (target[0] > value) { target[0] = value; }
    if (target[1] > value) { target[1] = value; }
    if (target[2] > value) { target[2] = value; }
    return this;
  },
  clamp: function(target, min, max) {
    this.min(target, min);
    this.max(target, max);
    return this;
  },
  limit: function(target, min, max) {
    var length = this.length(target);
    if (min !== null && length < min) {
      this.setLength(target, min);
    } else if (max !== null && length > max) {
      this.setLength(target, max);
    }
    return this;
  },
  dot: function(a, b) {
    return a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  },
  normalise: function(target) {
    return this.divideScalar(target, this.length(target));
  },
  negate: function(target) {
    return this.multiplyScalar(target, -1);
  },
  distanceSquared: function(a, b) {
    var dx = a[0] - b[0];
    var dy = a[1] - b[1];
    var dz = a[2] - b[2];
    return dx*dx + dy*dy + dz*dz;
  },
  distance: function(a, b) {
    return Math.sqrt(this.distanceSquared(a, b));
  },
  lengthSquared: function(a) {
    return a[0]*a[0] + a[1]*a[1] + a[2]*a[2];
  },
  length: function(a) {
    return Math.sqrt(this.lengthSquared(a));
  },
  setLength: function(target, l) {
    var length = this.length(target);
    if (length !== 0 && l !== length) {
      this.multiplyScalar(target, l / length);
    }
    return this;
  }
};

/**
 * @object Vector4
 * @author Matthew Wagerfield
 */
FSS.Vector4 = {
  create: function(x, y, z, w) {
    var vector = new FSS.Array(4);
    this.set(vector, x, y, z);
    return vector;
  },
  set: function(target, x, y, z, w) {
    target[0] = x || 0;
    target[1] = y || 0;
    target[2] = z || 0;
    target[3] = w || 0;
    return this;
  },
  setX: function(target, x) {
    target[0] = x || 0;
    return this;
  },
  setY: function(target, y) {
    target[1] = y || 0;
    return this;
  },
  setZ: function(target, z) {
    target[2] = z || 0;
    return this;
  },
  setW: function(target, w) {
    target[3] = w || 0;
    return this;
  },
  add: function(target, a) {
    target[0] += a[0];
    target[1] += a[1];
    target[2] += a[2];
    target[3] += a[3];
    return this;
  },
  multiplyVectors: function(target, a, b) {
    target[0] = a[0] * b[0];
    target[1] = a[1] * b[1];
    target[2] = a[2] * b[2];
    target[3] = a[3] * b[3];
    return this;
  },
  multiplyScalar: function(target, s) {
    target[0] *= s;
    target[1] *= s;
    target[2] *= s;
    target[3] *= s;
    return this;
  },
  min: function(target, value) {
    if (target[0] < value) { target[0] = value; }
    if (target[1] < value) { target[1] = value; }
    if (target[2] < value) { target[2] = value; }
    if (target[3] < value) { target[3] = value; }
    return this;
  },
  max: function(target, value) {
    if (target[0] > value) { target[0] = value; }
    if (target[1] > value) { target[1] = value; }
    if (target[2] > value) { target[2] = value; }
    if (target[3] > value) { target[3] = value; }
    return this;
  },
  clamp: function(target, min, max) {
    this.min(target, min);
    this.max(target, max);
    return this;
  }
};

/**
 * @class Color
 * @author Matthew Wagerfield
 */
FSS.Color = function(hex, opacity) {
  this.rgba = FSS.Vector4.create();
  this.hex = hex || '#000000';
  this.opacity = FSS.Utils.isNumber(opacity) ? opacity : 1;
  this.set(this.hex, this.opacity);
};

FSS.Color.prototype = {
  set: function(hex, opacity) {
    hex = hex.replace('#', '');
    var size = hex.length / 3;
    this.rgba[0] = parseInt(hex.substring(size*0, size*1), 16) / 255;
    this.rgba[1] = parseInt(hex.substring(size*1, size*2), 16) / 255;
    this.rgba[2] = parseInt(hex.substring(size*2, size*3), 16) / 255;
    this.rgba[3] = FSS.Utils.isNumber(opacity) ? opacity : this.rgba[3];
    return this;
  },
  hexify: function(channel) {
    var hex = Math.ceil(channel*255).toString(16);
    if (hex.length === 1) { hex = '0' + hex; }
    return hex;
  },
  format: function() {
    var r = this.hexify(this.rgba[0]);
    var g = this.hexify(this.rgba[1]);
    var b = this.hexify(this.rgba[2]);
    this.hex = '#' + r + g + b;
    return this.hex;
  }
};

/**
 * @class Object
 * @author Matthew Wagerfield
 */
FSS.Object = function() {
  this.position = FSS.Vector3.create();
};

FSS.Object.prototype = {
  setPosition: function(x, y, z) {
    FSS.Vector3.set(this.position, x, y, z);
    return this;
  }
};

/**
 * @class Light
 * @author Matthew Wagerfield
 */
FSS.Light = function(ambient, diffuse) {
  FSS.Object.call(this);
  this.ambient = new FSS.Color(ambient || '#FFFFFF');
  this.diffuse = new FSS.Color(diffuse || '#FFFFFF');
  this.ray = FSS.Vector3.create();
};

FSS.Light.prototype = Object.create(FSS.Object.prototype);

/**
 * @class Vertex
 * @author Matthew Wagerfield
 */
FSS.Vertex = function(x, y, z) {
  this.position = FSS.Vector3.create(x, y, z);
};

FSS.Vertex.prototype = {
  setPosition: function(x, y, z) {
    FSS.Vector3.set(this.position, x, y, z);
    return this;
  }
};

/**
 * @class Triangle
 * @author Matthew Wagerfield
 */
FSS.Triangle = function(a, b, c) {
  this.a = a || new FSS.Vertex();
  this.b = b || new FSS.Vertex();
  this.c = c || new FSS.Vertex();
  this.vertices = [this.a, this.b, this.c];
  this.u = FSS.Vector3.create();
  this.v = FSS.Vector3.create();
  this.centroid = FSS.Vector3.create();
  this.normal = FSS.Vector3.create();
  this.color = new FSS.Color();
  this.computeCentroid();
  this.computeNormal();
};

FSS.Triangle.prototype = {
  computeCentroid: function() {
    this.centroid[0] = this.a.position[0] + this.b.position[0] + this.c.position[0];
    this.centroid[1] = this.a.position[1] + this.b.position[1] + this.c.position[1];
    this.centroid[2] = this.a.position[2] + this.b.position[2] + this.c.position[2];
    FSS.Vector3.divideScalar(this.centroid, 3);
    return this;
  },
  computeNormal: function() {
    FSS.Vector3.subtractVectors(this.u, this.b.position, this.a.position);
    FSS.Vector3.subtractVectors(this.v, this.c.position, this.a.position);
    FSS.Vector3.crossVectors(this.normal, this.u, this.v);
    FSS.Vector3.normalise(this.normal);
    return this;
  }
};

/**
 * @class Geometry
 * @author Matthew Wagerfield
 */
FSS.Geometry = function() {
  this.vertices = [];
  this.triangles = [];
  this.dirty = false;
};

FSS.Geometry.prototype = {
  update: function() {
    if (this.dirty) {
      //Logger.debug('Recalculating triangle centroids and normals.');
      var t,triangle;
      for (t = this.triangles.length - 1; t >= 0; t--) {
        triangle = this.triangles[t];
        triangle.computeCentroid();
        triangle.computeNormal();
      }
      this.dirty = false;
    }
    return this;
  }
};

/**
 * @class Plane
 * @author Matthew Wagerfield, modified by Maksim Surguy to implement Delaunay triangulation
 */
FSS.Plane = function(width, height, howmany, img) {
  FSS.Geometry.call(this);
  this.width = width || 100;
  this.height = height || 100;

  // Cache Variables
  var x, y, vertices = new Array(howmany);
  var offsetX = this.width * -0.5;
  var offsetY = this.height * 0.5;

  for(i = vertices.length; i--; ) {
    x =  offsetX + Math.random()*width;
    y =  offsetY - Math.random()*height;

    vertices[i] = [x, y];
  }

  if (img) {
    if (img.grayscale) {
      var rescale = 1; // ?

      var threshold = 30;
      jsfeat.fast_corners.set_threshold(threshold);

      var corners = [];
      for(var i = 0; i < img.grayscale.cols*img.grayscale.rows; ++i) {
        corners[i] = new jsfeat.keypoint_t(0,0,0,0);
      }

      var count = Math.min( 500, jsfeat.fast_corners.detect(img.grayscale, corners, 3) );

      for (var i = 0; i < count; i++) {
        vertices.push([corners[i].x*rescale, corners[i].y*rescale]);
      }

      if (count > 0) {
        Logger.debug('Feature points added.');
      }
    }

  } else {
    // No image loaded
    Logger.debug('No image loaded, not adding feature points.');
  }

  // Generate additional points on the perimeter so that there are no holes in the pattern
  vertices.push([offsetX, offsetY]);
  vertices.push([offsetX + width/2, offsetY]);
  vertices.push([offsetX + width, offsetY]);
  vertices.push([offsetX + width, offsetY - height/2]);
  vertices.push([offsetX + width, offsetY - height]);
  vertices.push([offsetX + width/2, offsetY - height]);
  vertices.push([offsetX, offsetY - height]);
  vertices.push([offsetX, offsetY - height/2]);

  // Generate additional randomly placed points on the perimeter
  for (var i = 6; i >= 0; i--) {
    vertices.push([ offsetX + Math.random()*width, offsetY]);
    vertices.push([ offsetX, offsetY - Math.random()*height]);
    vertices.push([ offsetX + width, offsetY - Math.random()*height]);
    vertices.push([ offsetX + Math.random()*width, offsetY-height]);
  }

  // Add feature points base on jsfeat grayscale

  // Create an array of triangulated coordinates from our vertices
  var triangles = Delaunay.triangulate(vertices);

  for(i = triangles.length; i; ) {
    --i;
    var v1 = new FSS.Vertex(Math.ceil(vertices[triangles[i]][0]), Math.ceil(vertices[triangles[i]][1]));
    --i;
    var v2 = new FSS.Vertex(Math.ceil(vertices[triangles[i]][0]), Math.ceil(vertices[triangles[i]][1]));
    --i;
    var v3 = new FSS.Vertex(Math.ceil(vertices[triangles[i]][0]), Math.ceil(vertices[triangles[i]][1]));
    var t1 = new FSS.Triangle(v1,v2,v3);
    this.triangles.push(t1);
    this.vertices.push(v1);
    this.vertices.push(v2);
    this.vertices.push(v3);
  }
};

FSS.Plane.prototype = Object.create(FSS.Geometry.prototype);

/**
 * @class Material
 * @author Matthew Wagerfield
 */
FSS.Material = function(ambient, diffuse) {
  this.ambient = new FSS.Color(ambient || '#444444');
  this.diffuse = new FSS.Color(diffuse || '#FFFFFF');
  this.slave = new FSS.Color();
};

/**
 * @class Mesh
 * @author Matthew Wagerfield
 */
FSS.Mesh = function(geometry, material) {
  FSS.Object.call(this);
  this.geometry = geometry || new FSS.Geometry();
  this.material = material || new FSS.Material();
  this.side = FSS.FRONT;
  this.visible = true;
};

FSS.Mesh.prototype = Object.create(FSS.Object.prototype);

FSS.Mesh.prototype.update = function(renderer, lights, calculate) {
  var t,triangle, l,light, illuminance;

  // Update Geometry
  this.geometry.update();

  // Calculate the triangle colors
  if (calculate) {

    //Logger.debug('bBox=',this.getBBox());

    // Iterate through Triangles
    for (t = this.geometry.triangles.length - 1; t >= 0; t--) {
      triangle = this.geometry.triangles[t];

      // Reset Triangle Color
      //FSS.Vector4.set(triangle.color.rgba);
      triangle.color = getTriangleColor(triangle.centroid, this.getBBox(), renderer);
      //triangle.color = new FSS.Color(rgbToHex(255, 0, 255), 1);
      //Logger.debug('triangle.color = ', triangle.color);

      // Iterate through Lights
      for (l = lights.length - 1; l >= 0; l--) {
        light = lights[l];

        // Calculate Illuminance
        FSS.Vector3.subtractVectors(light.ray, light.position, triangle.centroid);
        FSS.Vector3.normalise(light.ray);
        illuminance = FSS.Vector3.dot(triangle.normal, light.ray);
        if (this.side === FSS.FRONT) {
          illuminance = Math.max(illuminance, 0);
        } else if (this.side === FSS.BACK) {
          illuminance = Math.abs(Math.min(illuminance, 0));
        } else if (this.side === FSS.DOUBLE) {
          illuminance = Math.max(Math.abs(illuminance), 0);
        }

        // Calculate Ambient Light
        FSS.Vector4.multiplyVectors(this.material.slave.rgba, this.material.ambient.rgba, light.ambient.rgba);
        FSS.Vector4.add(triangle.color.rgba, this.material.slave.rgba);

        // Calculate Diffuse Light
        FSS.Vector4.multiplyVectors(this.material.slave.rgba, this.material.diffuse.rgba, light.diffuse.rgba);
        FSS.Vector4.multiplyScalar(this.material.slave.rgba, illuminance);
        FSS.Vector4.add(triangle.color.rgba, this.material.slave.rgba);
      }

      // Clamp & Format Color
      FSS.Vector4.clamp(triangle.color.rgba, 0, 1);
    }
  }
  return this;
};

FSS.Mesh.prototype.getBBox = function() {

  var xMin, xMax, yMin, yMax;
  var t,triangle;

  xMin = Number.POSITIVE_INFINITY;
  xMax = Number.NEGATIVE_INFINITY;
  yMin = Number.POSITIVE_INFINITY;
  yMax = Number.NEGATIVE_INFINITY;

  // Iterate through Triangles
  for (t = this.geometry.triangles.length - 1; t >= 0; t--) {
    triangle = this.geometry.triangles[t];
    var vertices = triangle.vertices;

    for (var i = 0; i < 2; i++) {
      var vertex = vertices[i];

      if (vertex.position[0] < xMin) {
        xMin = vertex.position[0];
      }

      if (vertex.position[0] > xMax) {
        xMax = vertex.position[0];
      }

      if (vertex.position[1] < yMin) {
        yMin = vertex.position[1];
      }

      if (vertex.position[1] > yMax) {
        yMax = vertex.position[1];
      }
    }
  }

  return [xMin, xMax, yMin, yMax];
};

/**
 * @class Scene
 * @author Matthew Wagerfield
 */
FSS.Scene = function() {
  this.meshes = [];
  this.lights = [];
};

FSS.Scene.prototype = {
  add: function(object) {
    if (object instanceof FSS.Mesh && !~this.meshes.indexOf(object)) {
      this.meshes.push(object);
    } else if (object instanceof FSS.Light && !~this.lights.indexOf(object)) {
      this.lights.push(object);
    }
    return this;
  },
  remove: function(object) {
    if (object instanceof FSS.Mesh && ~this.meshes.indexOf(object)) {
      this.meshes.splice(this.meshes.indexOf(object), 1);
    } else if (object instanceof FSS.Light && ~this.lights.indexOf(object)) {
      this.lights.splice(this.lights.indexOf(object), 1);
    }
    return this;
  }
};

/**
 * @class Renderer
 * @author Matthew Wagerfield
 */
FSS.Renderer = function() {
  this.width = 0;
  this.height = 0;
  this.halfWidth = 0;
  this.halfHeight = 0;
};

FSS.Renderer.prototype = {
  setSize: function(width, height) {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    this.halfWidth = this.width * 0.5;
    this.halfHeight = this.height * 0.5;
    return this;
  },
  clear: function() {
    return this;
  },
  render: function(scene) {
    return this;
  }
};

/**
 * @class WebGL Renderer
 * @author Matthew Wagerfield
 */
FSS.WebGLRenderer = function(gl) {
  FSS.Renderer.call(this);

  // Set initial vertex and light count
  this.vertices = null;
  this.lights = null;

  // Set gl
  this.gl = gl;

  // Create parameters object
  var parameters = {
    preserveDrawingBuffer: false,
    premultipliedAlpha: true,
    antialias: true,
    stencil: true,
    alpha: true
  };

  // Create and configure the gl context
  //this.gl = this.getContext(this.element, parameters);

  // Set the internal support flag
  this.unsupported = !this.gl;

  // Setup renderer
  if (this.unsupported) {
    return 'WebGL is not supported by your browser.';
  } else {
    this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
    this.gl.enable(this.gl.DEPTH_TEST);
    this.setSize(bufferWidth, bufferHeight);
    Logger.debug('Setting size', bufferWidth, 'x', bufferHeight);
  }
};

FSS.WebGLRenderer.prototype = Object.create(FSS.Renderer.prototype);

FSS.WebGLRenderer.prototype.setGL = function(gl) {
  this.gl = gl;
  Logger.debug('Setting gl for WebGLRenderer to', gl)
};


FSS.WebGLRenderer.prototype.getContext = function(canvas, parameters) {
  var context = false;
  try {
    if (!(context = canvas.getContext('experimental-webgl', parameters))) {
      throw 'Error creating WebGL context.';
    }
  } catch (error) {
    console.error(error);
  }
  return context;
};

FSS.WebGLRenderer.prototype.setSize = function(width, height) {
  FSS.Renderer.prototype.setSize.call(this, width, height);
  if (this.unsupported) return;

  // Set the size of the canvas element
  bufferWidth = width;
  bufferHeight = height;

  // Set the size of the gl viewport
  this.gl.viewport(0, 0, width, height);
  return this;
};

FSS.WebGLRenderer.prototype.clear = function() {
  FSS.Renderer.prototype.clear.call(this);
  if (this.unsupported) return;
  this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
  return this;
};

FSS.WebGLRenderer.prototype.render = function(scene) {
  FSS.Renderer.prototype.render.call(this, scene);
  Logger.debug('WebGLRenderer render @', getDateTime());

  if (this.unsupported) return;
  var m,mesh, t,tl,triangle, l,light,
      attribute, uniform, buffer, data, location,
      update = false, lights = scene.lights.length,
      index, v,vl,vetex,vertices = 0;

  // Clear context
  this.clear();

  // Build the shader program
  if (this.lights !== lights) {
    this.lights = lights;
    if (this.lights > 0) {
      this.buildProgram(lights);
    } else {
      return;
    }
  }

  // Update program
  if (!!this.program) {

    // Increment vertex counter
    for (m = scene.meshes.length - 1; m >= 0; m--) {
      mesh = scene.meshes[m];
      if (mesh.geometry.dirty) update = true;
      mesh.update(this, scene.lights, false);
      vertices += mesh.geometry.triangles.length*3;
    }

    // Compare vertex counter
    if (update || this.vertices !== vertices) {
      this.vertices = vertices;

      // Build buffers
      for (attribute in this.program.attributes) {
        buffer = this.program.attributes[attribute];
        buffer.data = new FSS.Array(vertices*buffer.size);

        // Reset vertex index
        index = 0;

        // Update attribute buffer data
        for (m = scene.meshes.length - 1; m >= 0; m--) {
          mesh = scene.meshes[m];

          for (t = 0, tl = mesh.geometry.triangles.length; t < tl; t++) {
            triangle = mesh.geometry.triangles[t];

            for (v = 0, vl = triangle.vertices.length; v < vl; v++) {
              var vertex = triangle.vertices[v];
              switch (attribute) {
                case 'side':
                  this.setBufferData(index, buffer, mesh.side);
                  break;
                case 'position':
                  this.setBufferData(index, buffer, vertex.position);
                  break;
                case 'centroid':
                  this.setBufferData(index, buffer, triangle.centroid);
                  break;
                case 'normal':
                  this.setBufferData(index, buffer, triangle.normal);
                  break;
                case 'ambient':
                  //this.setBufferData(index, buffer, mesh.material.ambient.rgba);
                  this.setBufferData(index, buffer, triangle.color.rgba);
                  break;
                case 'diffuse':
                  //this.setBufferData(index, buffer, mesh.material.diffuse.rgba);
                  this.setBufferData(index, buffer, triangle.color.rgba);
                  break;
              }
              index++;
            }
          }
        }

        // Upload attribute buffer data
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer.buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, buffer.data, this.gl.DYNAMIC_DRAW);
        this.gl.enableVertexAttribArray(buffer.location);
        this.gl.vertexAttribPointer(buffer.location, buffer.size, this.gl.FLOAT, false, 0, 0);
      }
    }

    // Build uniform buffers
    this.setBufferData(0, this.program.uniforms.resolution, [this.width, this.height, this.width]);
    for (l = lights-1; l >= 0; l--) {
      light = scene.lights[l];
      this.setBufferData(l, this.program.uniforms.lightPosition, light.position);
      this.setBufferData(l, this.program.uniforms.lightAmbient, light.ambient.rgba);
      this.setBufferData(l, this.program.uniforms.lightDiffuse, light.diffuse.rgba);
    }

    // Update uniforms
    for (uniform in this.program.uniforms) {
      buffer = this.program.uniforms[uniform];
      location = buffer.location;
      data = buffer.data;
      switch (buffer.structure) {
        case '3f':
          this.gl.uniform3f(location, data[0], data[1], data[2]);
          break;
        case '3fv':
          this.gl.uniform3fv(location, data);
          break;
        case '4fv':
          this.gl.uniform4fv(location, data);
          break;
      }
    }
  }

  // Draw those lovely triangles
  this.gl.drawArrays(this.gl.TRIANGLES, 0, this.vertices);

  Logger.debug('WebGLRenderer vertices @', this.vertices);
  Logger.debug('WebGLRenderer draw arrays @', getDateTime());
  return this;
};

FSS.WebGLRenderer.prototype.setBufferData = function(index, buffer, value) {
  if (FSS.Utils.isNumber(value)) {
    buffer.data[index*buffer.size] = value;
  } else {
    for (var i = value.length - 1; i >= 0; i--) {
      buffer.data[index*buffer.size+i] = value[i];
    }
  }
};

/**
 * Concepts taken from three.js WebGLRenderer
 * @see https://github.com/mrdoob/three.js/blob/master/src/renderers/WebGLRenderer.js
 */
FSS.WebGLRenderer.prototype.buildProgram = function(lights) {
  if (this.unsupported) return;

  Logger.debug('WebGLRenderer building program @', getDateTime());

  // Create shader source
  var vs = FSS.WebGLRenderer.VS(lights);
  var fs = FSS.WebGLRenderer.FS(lights);

  // Derive the shader fingerprint
  var code = vs + fs;

  // Check if the program has already been compiled
  if (!!this.program && this.program.code === code) return;

  // Create the program and shaders
  var program = this.gl.createProgram();
  var vertexShader = this.buildShader(this.gl.VERTEX_SHADER, vs);
  var fragmentShader = this.buildShader(this.gl.FRAGMENT_SHADER, fs);

  // Attach an link the shader
  this.gl.attachShader(program, vertexShader);
  this.gl.attachShader(program, fragmentShader);
  this.gl.linkProgram(program);

  // Add error handling
  if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
    var error = this.gl.getError();
    var status = this.gl.getProgramParameter(program, this.gl.VALIDATE_STATUS);
    console.error('Could not initialise shader.\nVALIDATE_STATUS: '+status+'\nERROR: '+error);
    return null;
  }

  // Delete the shader
  this.gl.deleteShader(fragmentShader);
  this.gl.deleteShader(vertexShader);

  // Set the program code
  program.code = code;

  // Add the program attributes
  program.attributes = {
    side:     this.buildBuffer(program, 'attribute', 'aSide',     1, 'f' ),
    position: this.buildBuffer(program, 'attribute', 'aPosition', 3, 'v3'),
    centroid: this.buildBuffer(program, 'attribute', 'aCentroid', 3, 'v3'),
    normal:   this.buildBuffer(program, 'attribute', 'aNormal',   3, 'v3'),
    ambient:  this.buildBuffer(program, 'attribute', 'aAmbient',  4, 'v4'),
    diffuse:  this.buildBuffer(program, 'attribute', 'aDiffuse',  4, 'v4')
  };

  // Add the program uniforms
  program.uniforms = {
    resolution:    this.buildBuffer(program, 'uniform', 'uResolution',    3, '3f',  1     ),
    lightPosition: this.buildBuffer(program, 'uniform', 'uLightPosition', 3, '3fv', lights),
    lightAmbient:  this.buildBuffer(program, 'uniform', 'uLightAmbient',  4, '4fv', lights),
    lightDiffuse:  this.buildBuffer(program, 'uniform', 'uLightDiffuse',  4, '4fv', lights)
  };

  // Set the renderer program
  this.program = program;

  // Enable program
  this.gl.useProgram(this.program);

  // Return the program
  return program;
};

FSS.WebGLRenderer.prototype.buildShader = function(type, source) {
  if (this.unsupported) return;

  // Create and compile shader
  var shader = this.gl.createShader(type);
  this.gl.shaderSource(shader, source);
  this.gl.compileShader(shader);

  // Add error handling
  if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
    console.error(this.gl.getShaderInfoLog(shader));
    return null;
  }

  // Return the shader
  return shader;
};

FSS.WebGLRenderer.prototype.buildBuffer = function(program, type, identifier, size, structure, count) {
  var buffer = {buffer:this.gl.createBuffer(), size:size, structure:structure, data:null};

  // Set the location
  switch (type) {
    case 'attribute':
      buffer.location = this.gl.getAttribLocation(program, identifier);
      break;
    case 'uniform':
      buffer.location = this.gl.getUniformLocation(program, identifier);
      break;
  }

  // Create the buffer if count is provided
  if (!!count) {
    buffer.data = new FSS.Array(count*size);
  }

  // Return the buffer
  return buffer;
};

FSS.WebGLRenderer.VS = function(lights) {
  var shader = [

  // Precision
  'precision mediump float;',

  // Lights
  '#define LIGHTS ' + lights,

  // Attributes
  'attribute float aSide;',
  'attribute vec3 aPosition;',
  'attribute vec3 aCentroid;',
  'attribute vec3 aNormal;',
  'attribute vec4 aAmbient;',
  'attribute vec4 aDiffuse;',

  // Uniforms
  'uniform vec3 uResolution;',
  'uniform vec3 uLightPosition[LIGHTS];',
  'uniform vec4 uLightAmbient[LIGHTS];',
  'uniform vec4 uLightDiffuse[LIGHTS];',

  // Varyings
  'varying vec4 vColor;',

  // Main
  'void main() {',

    // Create color
    'vColor = vec4(0.0);',

    // Calculate the vertex position
    'vec3 position = aPosition / uResolution * 2.0;',

    // Iterate through lights
    'for (int i = 0; i < LIGHTS; i++) {',
      'vec3 lightPosition = uLightPosition[i];',
      'vec4 lightAmbient = uLightAmbient[i];',
      'vec4 lightDiffuse = uLightDiffuse[i];',

      // Calculate illuminance
      'vec3 ray = normalize(lightPosition - aCentroid);',
      'float illuminance = dot(aNormal, ray);',
      'if (aSide == 0.0) {',
        'illuminance = max(illuminance, 0.0);',
      '} else if (aSide == 1.0) {',
        'illuminance = abs(min(illuminance, 0.0));',
      '} else if (aSide == 2.0) {',
        'illuminance = max(abs(illuminance), 0.0);',
      '}',

      // Calculate ambient light
      'vColor += aAmbient * lightAmbient;',

      // Calculate diffuse light
      'vColor += aDiffuse * lightDiffuse * illuminance;',
    '}',

    // Clamp color
    'vColor = clamp(vColor, 0.0, 1.0);',

    // Set gl_Position
    'gl_Position = vec4(position, 1.0);',

  '}'

  // Return the shader
  ].join('\n');
  return shader;
};

FSS.WebGLRenderer.FS = function(lights) {
  var shader = [

  // Precision
  'precision mediump float;',

  // Varyings
  'varying vec4 vColor;',

  // Main
  'void main() {',

    // Set gl_FragColor
    'gl_FragColor = vColor;',

  '}'

  // Return the shader
  ].join('\n');
  return shader;
};

var transparency = null;
var delay = null;
var disposalMethod = null;
var lastDisposalMethod = null;
var frame = null;
var curFrameNum = 0;

var sample = null;
var numSamples = 0;
var quadtree;

var mood = null;
var scale;

var storedPoints = [];

var resetTimeout = -1;
var uiTimeout = -1;

var distance = function(a, b) {
var dx = a[0] - b[0],
    dy = a[1] - b[1];
return dx * dx + dy * dy;
};

function fetchGifURL(keyword) {
  Logger.debug('Fetching gif url for keyword: ', keyword);

  var q = keyword; // search query

  request('http://api.giphy.com/v1/gifs/random?api_key=dc6zaTOxFJmzC&tag='+q, function (error, response, body) {
    Logger.debug('error:', error); // Print the error if one occurred
    Logger.debug('statusCode:', response && response.statusCode); // Print the response status code if a response was received
    //Logger.debug('body:', body); // Print the HTML for the Google homepage.
    Logger.debug('Retrieving gif from giphy.');
        if (response.statusCode >= 200 && response.statusCode < 400) {
          var urlData = JSON.parse(body).data.image_url;
          Logger.debug(keyword + ', URL = ' + urlData);
          storeURL(keyword, urlData);
          //Logger.debug('data = ', data);
        }
  });
}

function generateGrayscale() {
  // GENERATE GRAYSCALE CODE
  var image_data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  img.grayscale = new jsfeat.matrix_t(canvas.width, canvas.height, jsfeat.U8_t | jsfeat.C1_t);
  jsfeat.imgproc.grayscale(image_data.data, canvas.width, canvas.height, img.grayscale);
}

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Returns a Vector4 rgba representing triangle color
function getTriangleColor(centroid, bBox, renderer) {

  var count = 0;
  var gradientData = [];

  // Use gif color if loaded
  if (gifData.width != 0) {

    ///var sx = Math.floor( img.canvas.width * (box.x + box.width/2) / svg.width );
    //var sy = Math.floor( img.canvas.height * (box.y + box.height/2) / svg.height );
    //var px = img.context.getImageData(sx, sy, 1, 1).data;

    // Cache Variables
    //var offsetX = renderer.width * -0.5;
    //var offsetY = renderer.height * 0.5;

    var x = centroid[0] + (bBox[1]-bBox[0])/2;
    var y = centroid[1] + (bBox[3]-bBox[2])/2;
    //var sx = img.canvas.width * (x / renderer.width);
    //var sy = img.canvas.height * (y / renderer.height);

    //Logger.debug('bBox[0]=',bBox[0],'bBox[1]=',bBox[1],'bBox[1]-bBox[0]=',bBox[1]-bBox[0]);

    var sx = Math.floor(gifData.width * (x / (bBox[1]-bBox[0])));
    var sy = Math.floor(gifData.height * (y / (bBox[3]-bBox[2])));

    var iy = gifData.height-sy;
    //Logger.debug('sx=',sx,'sy=',sy);
    //var px = img.context.getImageData(sx, iy, 1, 1).data;

    var r = getRandomArbitrary(0,255);//gifData.frames[0][iy*gifData.width + sx + 0];
    var g = getRandomArbitrary(0,255);//gifData.frames[0][iy*gifData.width + sx + 1];
    var b = getRandomArbitrary(0,255);//gifData.frames[0][iy*gifData.width + sx + 2];

    //Logger.debug('gif data [r]=',r);
    //Logger.debug('gif data [g]=',g);
    //Logger.debug('gif data [b]=',b);

    //Logger.debug('x=',x);
    //Logger.debug('y=',y);
    //Logger.debug('(x / renderer.width)=',(x / (bBox[1]-bBox[0]));
    //Logger.debug('(y / renderer.height)=',(y / (bBox[3]-bBox[2])));

    //Logger.debug('triangle color: ', px);
    // Return rgba

    //return new FSS.Color(ambient || '#FFFFFF');
    //return FSS.Vector4.create(px[0], px[1], px[2], 1);
    //this.rgba

    //Logger.debug('triangle color: ', px);

    /*this.rgba[0] = parseInt(hex.substring(size*0, size*1), 16) / 255;
    this.rgba[1] = parseInt(hex.substring(size*1, size*2), 16) / 255;
    this.rgba[2] = parseInt(hex.substring(size*2, size*3), 16) / 255;
    this.rgba[3] = FSS.Utils.isNumber(opacity) ? opacity : this.rgba[3];*/

    //return FSS.Vector4.create(px[0] / 255, px[1] / 255, px[2] / 255, 1);

    var color = new FSS.Color(rgbToHex(r, g, b), 1);
    Logger.debug('color =',color);
    return color;
  }

  Logger.debug('No gif loaded, defaulting to black.');

  // Return blank rgba
  var color = new FSS.Color(rgbToHex(0, 0, 0), 1);
  //Logger.debug('color =',color);
  return color;
}

    //fill = "rgb("+px[0]+","+px[1]+","+px[2]+")"

    /*
    if (config.gradient) {

      var p1, p2;
      if (config.type=="delaunay") {
        p1 = this.points[0] || {x: box.x, y: box.y };
        p2 = {x:(this.points[1].x + this.points[2].x)/2, y:(this.points[1].y + this.points[2].y)/2} || {x: box.x+box.width, y:box.y+box.height};
      } else {
        p1 = {x: box.x, y: box.y };
        p2 = {x: box.x+box.width, y:box.y+box.height};
      }

      var sx1 = Math.min( img.canvas.width-1, Math.max( 0, Math.floor( img.canvas.width * (p1.x) / svg.width ) ));
      var sy1 = Math.min( img.canvas.height-1, Math.max( 0, Math.floor( img.canvas.height * (p1.y ) / svg.height ) ));
      var sx2 = Math.min( img.canvas.width-1, Math.max( 0, Math.floor( img.canvas.width * (p2.x) / svg.width ) ));
      var sy2 = Math.min( img.canvas.height-1, Math.max( 0, Math.floor( img.canvas.height * (p2.y) / svg.height ) ));

      var px1 = img.context.getImageData(sx1, sy1, 1, 1).data;
      var px2 = img.context.getImageData(sx2, sy2, 1, 1).data;

      var gg = createGradientDef(count, px1, px2, box);
      gradientData.push(gg);

      fill = "url(#"+gg.id+")";
      */

// Create gradient definitions
function updateGradient(gradientData) {

  var gradients = svg.defs.selectAll("linearGradient").data( gradientData, function(d) { return d.id; } );

  gradients.exit().remove();

  gradients.enter().append("linearGradient")
    .attr("id", function(d) { return d.id; } )
    .attr("gradientUnits", "userSpaceOnUse")
    .selectAll("stop").data( function(d) { return d.stops; }).enter().append("stop");

  gradients
    .attr("x1", function(d) { return d.box.x; }).attr("y1", function(d) { return d.box.y; } )
    .attr("x2", function(d) { return d.box.x + d.box.width })
    .attr("y2", function(d) { return d.box.y + d.box.height })
    .selectAll("stop")
      .attr("offset", function(d) { return d.offset; })
      .attr("stop-color", function(d) { return d.color; });
}

// Create gradient color object
function createGradientDef( index, c1, c2, box ) {
  var id = "gd"+index;
  return {
    id: id,
    box: box,
    stops: [
      {offset: "0%", color: "rgb("+c1[0]+","+c1[1]+","+c1[2]+")"},
      {offset: "100%", color: "rgb("+c2[0]+","+c2[1]+","+c2[2]+")"}
    ]
  };
}

// Handles dot movement
function onMove(target) {

  if (!target) return;

  var circle = svg.element.select( "#"+target.getAttribute("id")+"c" );
  var rect = target.getBoundingClientRect();
  var parentPos = dots.getBoundingClientRect();
  circle.attr("cx", rect.left - parentPos.left + dotSize ).attr("cy", rect.top - parentPos.top + dotSize );

  render();
}

// Best candidate sampling, based on http://bl.ocks.org/mbostock/b17e0b2aa8b2d50de465
function bestCandidateSampler(width, height, numCandidates, numSamplesMax) {

  return function() {
    //Logger.debug('numSamples: ', numSamples);
    //Logger.debug('numSamplesMax: ', numSamplesMax);
    if (++numSamples > numSamplesMax) { return; }
    var bestCandidate, bestDistance = 0;
    for (var i = 0; i < numCandidates; ++i) {
      var c = [Math.random() * width, Math.random() * height];
      var d = distance(quadtree.find(c), c);

      if (d > bestDistance) {
        bestDistance = d;
        bestCandidate = c;
      }
    }
    quadtree.add(bestCandidate);
    //Logger.debug('bestCandidate: ', bestCandidate);
    return bestCandidate;
  };

}

// Read image from file picker
function readImage() {
  if ( this.files && this.files[0] ) {
    var FR= new FileReader();
    FR.onload = function(e) {
      img.preview.setAttribute("src", e.target.result );
    };
    FR.readAsDataURL( this.files[0] );
  }
}


var impulse = 0.0;

//------------------------------
// Mesh Properties
//------------------------------
var MESH = {
  width: 1.2,
  height: 1.2,
  slices: 1200,
  depth: 0,
  maxdepth: 40,
  ambient: '#000000',
  diffuse: '#000000'
};

//------------------------------
// Light Properties
//------------------------------
var LIGHT = {
  count: 0,
  xPos : 0,
  yPos : 200,
  zOffset: 100,
  ambient: '#FFFFFF',
  diffuse: '#FFFFFF',
  pickedup :true,
  proxy : false,
  currIndex : 0,
  randomize : function(){
    var x,y,z;
    var decider = Math.floor(Math.random() * 3) + 1;

    if (decider == 1) MESH.depth = 0;
    if (decider == 2) MESH.depth = Math.randomInRange(0, 150);
    if (decider == 3) MESH.depth = Math.randomInRange(150, 200);

    for (l = scene.lights.length - 1; l >= 0; l--) {
      x = Math.randomInRange(-mesh.geometry.width/2, mesh.geometry.width/2);
      y = Math.randomInRange(-mesh.geometry.height/2, mesh.geometry.height/2);
      if(scene.lights.length > 2) z = Math.randomInRange(10, 80);
      else z = Math.randomInRange(10, 100);

      light = scene.lights[l];
      FSS.Vector3.set(light.position, x, y, z);

      //var diffuse = getRandomColor();
      //var ambient = getRandomColor();
      var diffuse = '#FFFFFF';
      var ambient = '#FFFFFF';

      light.diffuse.set(diffuse);
      light.diffuseHex = light.diffuse.format();

      light.ambient.set(ambient);
      light.ambientHex = light.ambient.format();

      LIGHT.xPos    = x;
      LIGHT.yPos    = y;
      LIGHT.zOffset = z;
      LIGHT.diffuse = diffuse;
      LIGHT.ambient = ambient;

      // Hacky way to allow manual update of the HEX colors for light's diffuse
      gui.__folders.Light.__controllers[1].updateDisplay();
      gui.__folders.Light.__controllers[2].updateDisplay();
    }
  }
};

//------------------------------
// Render Properties
//------------------------------
var WEBGL = 'webgl';
var RENDER = {
  renderer: WEBGL
};

//------------------------------
// Global Properties
//------------------------------
var center = FSS.Vector3.create();
var renderer, scene, mesh, geometry, material;
var webglRenderer;
var gui;

//------------------------------
// Methods
//------------------------------
function initialise(inputGifFile) {
  Logger.debug('Creating renderer.');
  createRenderer();
  Logger.debug('Creating scene.');
  createScene();
  Logger.debug('Creating mesh.');
  createMesh();
  Logger.debug('Adding lights.');
  addLights();

  Logger.debug('Retrieving gif.');

  getPixels(inputGifFile, function(err, pixels) {
    if(err) {
      Logger.debug("Bad image path");
      return;
    }
    //Logger.debug("pixel data", pixels.data);
    Logger.debug("Input gif width =", pixels.shape[1]);
    Logger.debug("Input gif height =", pixels.shape[2]);
    gifData.width = pixels.shape[1];
    gifData.height = pixels.shape[2];
    //[numFrames, width, height, 4]
    gifData.frames.push(pixels.data);
    Logger.debug("Stored frames =", gifData.frames.length);

    Logger.debug('Initializing export gif.');
    initExportGif('render.gif');

    //addControls();
    //LIGHT.randomize();

    resize(bufferWidth, bufferHeight);

    Logger.debug('Starting rendering process.');
    processFrame();
  });
}

function createRenderer() {
  webglRenderer = new FSS.WebGLRenderer(gl);
  setRenderer(RENDER.renderer);
}

function setRenderer(index) {
  // Force gl headless rendering
  renderer = webglRenderer;
  renderer.setSize(bufferWidth, bufferHeight);
}

function createScene() {
  scene = new FSS.Scene();
}

function createMesh() {
  scene.remove(mesh);
  renderer.clear();
  geometry = new FSS.Plane(MESH.width * renderer.width, MESH.height * renderer.height, MESH.slices, img);
  material = new FSS.Material(MESH.ambient, MESH.diffuse);
  mesh = new FSS.Mesh(geometry, material);
  scene.add(mesh);

  // Augment vertices for depth modification
  var v, vertex;
  for (v = geometry.vertices.length - 1; v >= 0; v--) {
    vertex = geometry.vertices[v];
    vertex.depth = Math.randomInRange(0, MESH.maxdepth/10);
    vertex.anchor = FSS.Vector3.clone(vertex.position);
  }
}

// Add a single light
function addLight(ambient, diffuse, x, y, z) {
  ambient = typeof ambient !== 'undefined' ? ambient : LIGHT.ambient;
  diffuse = typeof diffuse !== 'undefined' ? diffuse : LIGHT.diffuse;
  x = typeof x !== 'undefined' ? x : LIGHT.xPos;
  y = typeof y !== 'undefined' ? y : LIGHT.yPos;
  z = typeof z !== 'undefined' ? z : LIGHT.zOffset;

  renderer.clear();
  var light = new FSS.Light(ambient, diffuse);
  light.ambientHex = light.ambient.format();
  light.diffuseHex = light.diffuse.format();
  light.setPosition(x, y, z);
  scene.add(light);
  LIGHT.diffuse = diffuse;
  LIGHT.proxy = light;
  LIGHT.pickedup = true;
  LIGHT.currIndex++;
}

function addLights() {
  //var num = Math.floor(Math.random() * 4) + 1;
  var num = 1;

  for (var i = num - 1; i >= 0; i--) {
    addLight();
    LIGHT.count++;
  };
}

// Remove lights
function trimLights(value) {
  for (l = value; l <= scene.lights.length; l++) {
    light = scene.lights[l];
    scene.remove(light);
    LIGHT.currIndex--;
  }
  LIGHT.proxy = scene.lights[LIGHT.currIndex-1];
  LIGHT.pickedup = false;

  renderer.clear();
}

// Resize canvas
function resize(width, height) {
  renderer.setSize(width, height);
  FSS.Vector3.set(center, renderer.halfWidth, renderer.halfHeight);
  createMesh();
}

function getDateTime() {

    var date = new Date();

    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;

    var min  = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;

    var sec  = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;

    var year = date.getFullYear();

    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;

    var day  = date.getDate();
    day = (day < 10 ? "0" : "") + day;

    return year + ":" + month + ":" + day + ":" + hour + ":" + min + ":" + sec;
}

/**
* Converts milliseconds to human readeable language separated by ":"
* Example: 190980000 --> 2:05:3 --> 2days 5hours 3min
*/
function dhm(t){
   var cd = 24 * 60 * 60 * 1000,
       ch = 60 * 60 * 1000,
       d = Math.floor(t / cd),
       h = '0' + Math.floor( (t - d * cd) / ch),
       m = '0' + Math.round( (t - d * cd - h * ch) / 60000);
   return [d, h.substr(-2), m.substr(-2)].join(':');
}

var frameCount = 0;
var lastFrameRenderTime = new Date().getTime();

function processFrame() {
  frameCount++;

  var frame = frameCount;
  var currentTime = new Date().getTime();

  if (frameCount > 10) {
    Logger.debug('[' + frame + '] Frame count met, ending processing @', getDateTime());
    finishExportGif();
    return;
  }

  Logger.debug('[' + frame + '] Frame render @', getDateTime());


  // Calculate and render visualizations
  mesh.update(renderer, scene.lights, true);
  update(impulse);
  render();


  // Export visualization
  // Store gif frame
  var pixels = [];
  for(var i=0; i<(bufferWidth * bufferHeight*4); i+=4) {
    //for(var j=0; j<3; ++j) {
    pixels[i+0] = getRandomArbitrary(0,255);
    pixels[i+1] = getRandomArbitrary(0,255);
    pixels[i+2] = getRandomArbitrary(0,255);
    pixels[i+3] = 0;
    //}
  }


  //gl.clear(gl.COLOR_BUFFER_BIT);
  // Clear screen to random color
  //gl.clearColor(getRandomArbitrary(0,1), getRandomArbitrary(0,1), getRandomArbitrary(0,1), 1);


  // Creates fragment shader (returns white color for any position)
  var fshader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fshader, 'void main(void) {gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);}');
  gl.compileShader(fshader);
  if (!gl.getShaderParameter(fshader, gl.COMPILE_STATUS))
  {alert('Error during fragment shader compilation:\n' + gl.getShaderInfoLog(fshader)); return;}

  // Creates vertex shader (converts 2D point position to coordinates)
  var vshader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vshader, 'attribute vec2 ppos; void main(void) { gl_Position = vec4(ppos.x, ppos.y, 0.0, 1.0);}');
  gl.compileShader(vshader);
  if (!gl.getShaderParameter(vshader, gl.COMPILE_STATUS))
  {alert('Error during vertex shader compilation:\n' + gl.getShaderInfoLog(vshader)); return;}

  // Creates program and links shaders to it
  var program = gl.createProgram();
  gl.attachShader(program, fshader);
  gl.attachShader(program, vshader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
  {alert('Error during program linking:\n' + gl.getProgramInfoLog(program));return;}

  // Validates and uses program in the GL context
  gl.validateProgram(program);
  if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS))
  {alert('Error during program validation:\n' + gl.getProgramInfoLog(program));return;}
  gl.useProgram(program);

  // Gets address of the input 'attribute' of the vertex shader
  var vattrib = gl.getAttribLocation(program, 'ppos');
  if(vattrib == -1)
  {alert('Error during attribute address retrieval');return;}
  gl.enableVertexAttribArray(vattrib);

  // Initializes the vertex buffer and sets it as current one
  var vbuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbuffer);

  // Puts vertices to buffer and links it to attribute variable 'ppos'
  var vertices = new Float32Array([0.0,0.5,-0.5,-0.5,0.5,-0.5]);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.vertexAttribPointer(vattrib, 2, gl.FLOAT, false, 0, 0);

  // Draws the object
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.flush();



  Logger.debug('[' + frame + '] Frame export @', getDateTime());
  // Read pixels from gl buffer
  var pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
  gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  Logger.debug('[' + frame + '] Encoding frame @', getDateTime());
  // Write out the image into memory
  encoder.addFrame(pixels);

  // Apply physics
  impulse -= impulse * 0.5;
  if (impulse < 0) {
    impulse = 0;
  }

  var delta = currentTime-lastFrameRenderTime;
  var deltaTime = dhm(delta);
  Logger.debug('[' + frame + '] Total frame render time:', deltaTime);

  // Store render time for next frame
  lastFrameRenderTime = currentTime;

  // Continue loop to next frame
  requestAnimationFrame(processFrame);
}

function finishExportGif() {

  encoder.finish();
  Logger.debug('Encoding completed.');

}

function initExportGif(filename) {

  // stream the results as they are available into myanimated.gif
  encoder.createReadStream().pipe(fs.createWriteStream(filename));

  encoder.start();
  encoder.setRepeat(0);  // 0 for repeat, -1 for no-repeat
  encoder.setDelay(50);  // frame delay in ms
  encoder.setQuality(10); // image quality. 10 is default.

  Logger.debug('GL drawing buffer width = ' + gl.drawingBufferWidth);
  Logger.debug('GL drawing buffer height = ' + gl.drawingBufferHeight);
}

/**
 * Request Animation Frame Polyfill.
 * @author Paul Irish
 * @see https://gist.github.com/paulirish/1579671
 */

var lastTime = 0;

var requestAnimationFrame = function(callback, element) {
  Logger.debug('Submitted next frame for rendering.');
  var currentTime = new Date().getTime();
  var timeToCall = Math.max(0, 16 - (currentTime - lastTime));
  var id = setTimeout(callback(currentTime + timeToCall), timeToCall);
  lastTime = currentTime + timeToCall;
  return id;
};

var cancelAnimationFrame = function(id) {
  clearTimeout(id);
};

function update(vibFactor) {
  var v, vertex, offset = MESH.depth/100;

  // Add depth to Vertices
  for (v = geometry.vertices.length - 1; v >= 0; v--) {
    vertex = geometry.vertices[v];
    FSS.Vector3.set(vertex.position, 1, 1, vertex.depth*offset);
    FSS.Vector3.add(vertex.position, vertex.anchor);

    var dx =  Math.random()*vibFactor;
    var dy =  -Math.random()*vibFactor;
    //x =  vertex.position[0] + dx + 1;//+ Math.random()*width;
    //y =  vertex.position[1] + dy;//- Math.random()*height;

    //vertices[i] = [x, y];
    var delta = FSS.Vector3.create(dx, dy, 0);
    FSS.Vector3.add(vertex.position, delta);
  }

  // Set the Geometry to dirty
  geometry.dirty = true;
}

function render() {
  renderer.render(scene);
}

function getRandomColor(){
  return '#'+(Math.random().toString(16) + '000000').slice(2, 8);
}

//------------------------------
// Callbacks
//------------------------------

/* SHATTER EFFECT
// Pick up the light when a space is pressed
Mousetrap.bind('space', function() {
  createMesh();
//    LIGHT.pickedup = !LIGHT.pickedup;
  //createMesh();
  impulse += 5.0;
  //requestAnimationFrame(animate);
  mesh.update(renderer, scene.lights, true);

});
*/

initialise('test.gif');

})();
