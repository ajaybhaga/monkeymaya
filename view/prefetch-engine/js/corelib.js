/**

Monkey Maya Video Processing Engine: Core Library
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

Thanks to Matthew Wagerfield & Maksim Surguy for portions of supporting code.

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

  // Create parameters object
  var parameters = {
    preserveDrawingBuffer: false,
    premultipliedAlpha: true,
    antialias: true,
    stencil: true,
    alpha: true
  };

  var gl = require('gl')(bufferWidth, bufferHeight, parameters);
//
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
  var storedPoints = [];

  // look up where the vertex data needs to go.
  var positionLocation;
  //var colorLocation;

  // lookup uniforms
  var matrixLocation;

  var positionBuffer;
  //var colorBuffer;

  var translation = [0, 0, 0];
  var rotation = [degToRad(0), degToRad(0), degToRad(0)];
  var scale = [1, 1, 1];


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
  this.ambient = new FSS.Color(ambient || getRandomColor());
  this.diffuse = new FSS.Color(diffuse || getRandomColor());
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
FSS.Plane = function(width, height, howmany) {
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

/*
   JSFEAT GRAYSCALE FEATURE POINTS FOR MORE DETAIL

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

  */

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
    var v1 = new FSS.Vertex(Math.ceil(vertices[triangles[i]][0]), Math.ceil(vertices[triangles[i]][1]), 20.0);
    --i;
    var v2 = new FSS.Vertex(Math.ceil(vertices[triangles[i]][0]), Math.ceil(vertices[triangles[i]][1]), 20.0);
    --i;
    var v3 = new FSS.Vertex(Math.ceil(vertices[triangles[i]][0]), Math.ceil(vertices[triangles[i]][1]), 20.0);
    var t1 = new FSS.Triangle(v1,v2,v3);
    //Logger.debug('triangle=',v1,v2,v3);
    this.triangles.push(t1);
    this.vertices.push(v1);
    this.vertices.push(v2);
    this.vertices.push(v3);
  }

  Logger.debug('Calculated vertices for Delaunay triangles [', triangles.length,'] @', getDateTime());

};

FSS.Plane.prototype = Object.create(FSS.Geometry.prototype);

/**
 * @class Material
 * @author Matthew Wagerfield
 */
FSS.Material = function(ambient, diffuse) {
  this.ambient = new FSS.Color(ambient || getRandomColor());
  this.diffuse = new FSS.Color(diffuse || getRandomColor());
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
      FSS.Vector4.set(triangle.color.rgba);
//      triangle.color.rgba = getTriangleColor(triangle.centroid, this.getBBox(), renderer);
      triangle.color.rgba = new FSS.Color(1.0, 0.0, 1.0, 1.0);
      //Logger.debug('triangle.color = ', triangle.color);

/*
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

*/
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

  // Set the internal support flag
  this.unsupported = !this.gl;

  // Setup renderer
  if (this.unsupported) {
    return 'WebGL is not supported by your browser.';
  } else {
    this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
    this.gl.clearDepth(1.0);
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.depthFunc(this.gl.LEQUAL); // Near things obscure far things

    this.setSize(bufferWidth, bufferHeight);
    Logger.debug('Setting size', bufferWidth, 'x', bufferHeight);
    //initVertexField(gl,false);
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

FSS.WebGLRenderer.prototype.render = function(scene, program, callback) {
  FSS.Renderer.prototype.render.call(this, scene);
  Logger.debug('WebGLRenderer render @', getDateTime());

  if (this.unsupported) return;

  positionLocation = gl.getAttribLocation(program, "aPosition");
  //colorLocation = gl.getAttribLocation(program, "a_color");

  // look up where the vertex data needs to go.
  // lookup uniforms
  matrixLocation = gl.getUniformLocation(program, "uMatrix");

  //Logger.debug('matrixLocation=', matrixLocation);




  // Create a buffer to put colors in
  //colorBuffer = gl.createBuffer();
  // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = colorBuffer)
  //gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  // Put geometry data into buffer
  //setColors(gl);

  // Draw scene
  drawScene(this, callback);

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

  Logger.debug('Creating program=',code);

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
    //side:     this.buildBuffer(program, 'attribute', 'aSide',     1, 'f' ),
    position: this.buildBuffer(program, 'attribute', 'aPosition', 3, 'v3'),
    //centroid: this.buildBuffer(program, 'attribute', 'aCentroid', 3, 'v3'),
    //normal:   this.buildBuffer(program, 'attribute', 'aNormal',   3, 'v3'),
    //ambient:  this.buildBuffer(program, 'attribute', 'aAmbient',  4, 'v4'),
    //diffuse:  this.buildBuffer(program, 'attribute', 'aDiffuse',  4, 'v4')
  };

  // Add the program uniforms
  program.uniforms = {
//    resolution:    this.buildBuffer(program, 'uniform', 'uResolution',    3, '3f',  1     ),
    //lightPosition: this.buildBuffer(program, 'uniform', 'uLightPosition', 3, '3fv', lights),
    //lightAmbient:  this.buildBuffer(program, 'uniform', 'uLightAmbient',  4, '4fv', lights),
    //lightDiffuse:  this.buildBuffer(program, 'uniform', 'uLightDiffuse',  4, '4fv', lights),
    //matrix:        this.buildBuffer(program, 'uniform', 'uMatrix',  16, '4m')
  };

  // Set the renderer program
  this.program = program;

  // Enable program
  this.gl.useProgram(this.program);

  //Logger.debug('Using program,', this.program);

  Logger.debug('Starting rendering process.');
  processFrame(program);

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
  var buffer = {buffer:this.gl.createBuffer(), size:size, structure:structure, identifier:identifier, data:null};

  Logger.debug('Built buffer for ', identifier);

  // Set the location
  switch (type) {
    case 'attribute':
      buffer.location = this.gl.getAttribLocation(program, identifier);
      break;
    case 'uniform':
      buffer.location = this.gl.getUniformLocation(program, identifier);
      break;
  }

  Logger.debug('buffer.location ', buffer.location);


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
//  '#define LIGHTS ' + lights,

  // Attributes
//  'attribute float aSide;',
  'attribute vec4 aPosition;',
//  'attribute vec3 aCentroid;',
//  'attribute vec3 aNormal;',
//  'attribute vec4 aAmbient;',
//  'attribute vec4 aDiffuse;',

  //'attribute vec4 a_position;',
  'attribute vec4 a_color;',

/*
  // Uniforms
  'uniform vec3 uResolution;',
  'uniform vec3 uLightPosition[LIGHTS];',
  'uniform vec4 uLightAmbient[LIGHTS];',
  'uniform vec4 uLightDiffuse[LIGHTS];',
*/
  'uniform mat4 uMatrix;',

  // Varyings
  'varying vec4 v_color;',

  // Main
  'void main() {',

    // Set color
    'v_color = vec4(0.0,1.0,1.0,1.0);',
//    'vColor = aVertexColor;',
//    'gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);',


    // Divide x and y by z.
    'gl_Position = uMatrix * aPosition;',
    //'gl_Position = u_matrix * a_position;',

    // Pass the color to the fragment shader.
    //'v_color = a_color;',
    // Calculate the vertex position
  //  'vec3 position = aPosition / uResolution;',//' * 2.0;',
  //  'vec3 position = aPosition / 1000.0;',

/*
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
      'v_color += aAmbient * lightAmbient;',

      // Calculate diffuse light
      'v_color += aDiffuse * lightDiffuse * illuminance;',
      // Set gl_Position
      //'gl_Position = vec4(aPosition, 1.0);',


    '}', */

    // Clamp color
    //'vColor = clamp(vColor, 0.0, 1.0);',


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
  'varying vec4 v_color;',

  // Main
  'void main() {',

    // Set gl_FragColor
    'gl_FragColor = v_color;',
    //'gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);',
    //'gl_FragColor = vec4(gl_FragCoord.x / 640.0, gl_FragCoord.y / 480.0, 0, 1);',

  '}',

  // Return the shader
  ].join('\n');
  return shader;
};

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

    var color = new FSS.Color('#FFFFFF', 1);
    //Logger.debug('color =',color);
    return color;
  }

  Logger.debug('No gif loaded, defaulting to black.');

  // Return blank rgba
  //var color = new FSS.Color(rgbToHex(0, 0, 0), 0);
  //Logger.debug('color =',color);
  //return color;
}

var impulse = 0.0;

//------------------------------
// Mesh Properties
//------------------------------
var MESH = {
  width: 200,
  height: 200,
  slices: 200,
  depth: 0,
  maxdepth: 40,
  ambient: '#FFFFFF',
  diffuse: '#FFFFFF'
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

      var diffuse = getRandomColor();
      var ambient = getRandomColor();
      //var diffuse = '#FFFFFF';
      //var ambient = '#FFFFFF';

      light.diffuse.set(diffuse);
      light.diffuseHex = light.diffuse.format();

      light.ambient.set(ambient);
      light.ambientHex = light.ambient.format();

      LIGHT.xPos    = x;
      LIGHT.yPos    = y;
      LIGHT.zOffset = z;
      LIGHT.diffuse = diffuse;
      LIGHT.ambient = ambient;

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
  resize(bufferWidth, bufferHeight);

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

    var program = renderer.buildProgram(scene.lights.length);
    //Logger.debug(program);
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
  geometry = new FSS.Plane(MESH.width, MESH.height, MESH.slices);
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
  var num = 4;

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

/**
* Main Frame Loop
*/
function processFrame(program) {
  frameCount++;

  var frame = frameCount;
  var currentTime = new Date().getTime();

  if (frameCount > 30) {
    Logger.debug('[' + frame + '] Frame count met, ending processing @', getDateTime());
    finishExportGif();
    //initExportGif('render' + frameCount + '.gif');
    return;
  }

  Logger.debug('[' + frame + '] Frame render @', getDateTime());

  // Clear context
  renderer.clear();

  createMesh();

  //if (frameCount % 0 == 0) {
    // Calculate and render visualizations
  //  mesh.update(renderer, scene.lights, true);
    update(impulse);
    render(program, function() {

      gl.flush();
      Logger.debug('[' + frame + '] Frame rendering completed @', getDateTime());


      Logger.debug('[' + frame + '] Frame export @', getDateTime());
      // Read pixels from gl buffer
      var pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      Logger.debug('[' + frame + '] Encoding frame @', getDateTime());
      // Write out the image into memory
      encoder.addFrame(pixels);

      /*finishExportGif();
      Logger.debug('Initializing export gif.');
      initExportGif('render' + frameCount + '.gif');*/

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
      requestAnimationFrame(processFrame(program));
    });
  //}

  // Export visualization
  // Store gif frame

  /*
  // Random pixels
  var pixels = [];
  for(var i=0; i<(bufferWidth * bufferHeight*4); i+=4) {
    //for(var j=0; j<3; ++j) {
    pixels[i+0] = getRandomArbitrary(0,255);
    pixels[i+1] = getRandomArbitrary(0,255);
    pixels[i+2] = getRandomArbitrary(0,255);
    pixels[i+3] = 0;
    //}
  }
  */

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
  encoder.setDelay(60);  // frame delay in ms
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

var requestAnimationFrame = function(callback) {
  if (callback) {
    Logger.debug('Submitted next frame for rendering.');
    var currentTime = new Date().getTime();
    var timeToCall = Math.max(0, 16 - (currentTime - lastTime));
    var id = setTimeout(function() { callback(currentTime + timeToCall); }, timeToCall);
    lastTime = currentTime + timeToCall;
    return id;
  }
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

function render(program, callback) {
  renderer.render(scene, program, callback);
}

function getRandomColor(){
  return '#'+(Math.random().toString(16) + '000000').slice(2, 8);
}

var m4 = {

  perspective: function(fieldOfViewInRadians, aspect, near, far) {
    var f = Math.tan(Math.PI * 0.5 - 0.5 * fieldOfViewInRadians);
    var rangeInv = 1.0 / (near - far);

    return [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (near + far) * rangeInv, -1,
      0, 0, near * far * rangeInv * 2, 0
    ];
  },

  projection: function(width, height, depth) {
    // Note: This matrix flips the Y axis so 0 is at the top.
    return [
       2 / width, 0, 0, 0,
       0, -2 / height, 0, 0,
       0, 0, 2 / depth, 0,
      -1, 1, 0, 1,
    ];
  },

  multiply: function(a, b) {
    var a00 = a[0 * 4 + 0];
    var a01 = a[0 * 4 + 1];
    var a02 = a[0 * 4 + 2];
    var a03 = a[0 * 4 + 3];
    var a10 = a[1 * 4 + 0];
    var a11 = a[1 * 4 + 1];
    var a12 = a[1 * 4 + 2];
    var a13 = a[1 * 4 + 3];
    var a20 = a[2 * 4 + 0];
    var a21 = a[2 * 4 + 1];
    var a22 = a[2 * 4 + 2];
    var a23 = a[2 * 4 + 3];
    var a30 = a[3 * 4 + 0];
    var a31 = a[3 * 4 + 1];
    var a32 = a[3 * 4 + 2];
    var a33 = a[3 * 4 + 3];
    var b00 = b[0 * 4 + 0];
    var b01 = b[0 * 4 + 1];
    var b02 = b[0 * 4 + 2];
    var b03 = b[0 * 4 + 3];
    var b10 = b[1 * 4 + 0];
    var b11 = b[1 * 4 + 1];
    var b12 = b[1 * 4 + 2];
    var b13 = b[1 * 4 + 3];
    var b20 = b[2 * 4 + 0];
    var b21 = b[2 * 4 + 1];
    var b22 = b[2 * 4 + 2];
    var b23 = b[2 * 4 + 3];
    var b30 = b[3 * 4 + 0];
    var b31 = b[3 * 4 + 1];
    var b32 = b[3 * 4 + 2];
    var b33 = b[3 * 4 + 3];
    return [
      b00 * a00 + b01 * a10 + b02 * a20 + b03 * a30,
      b00 * a01 + b01 * a11 + b02 * a21 + b03 * a31,
      b00 * a02 + b01 * a12 + b02 * a22 + b03 * a32,
      b00 * a03 + b01 * a13 + b02 * a23 + b03 * a33,
      b10 * a00 + b11 * a10 + b12 * a20 + b13 * a30,
      b10 * a01 + b11 * a11 + b12 * a21 + b13 * a31,
      b10 * a02 + b11 * a12 + b12 * a22 + b13 * a32,
      b10 * a03 + b11 * a13 + b12 * a23 + b13 * a33,
      b20 * a00 + b21 * a10 + b22 * a20 + b23 * a30,
      b20 * a01 + b21 * a11 + b22 * a21 + b23 * a31,
      b20 * a02 + b21 * a12 + b22 * a22 + b23 * a32,
      b20 * a03 + b21 * a13 + b22 * a23 + b23 * a33,
      b30 * a00 + b31 * a10 + b32 * a20 + b33 * a30,
      b30 * a01 + b31 * a11 + b32 * a21 + b33 * a31,
      b30 * a02 + b31 * a12 + b32 * a22 + b33 * a32,
      b30 * a03 + b31 * a13 + b32 * a23 + b33 * a33,
    ];
  },

  translation: function(tx, ty, tz) {
    return [
       1,  0,  0,  0,
       0,  1,  0,  0,
       0,  0,  1,  0,
       tx, ty, tz, 1,
    ];
  },

  xRotation: function(angleInRadians) {
    var c = Math.cos(angleInRadians);
    var s = Math.sin(angleInRadians);

    return [
      1, 0, 0, 0,
      0, c, s, 0,
      0, -s, c, 0,
      0, 0, 0, 1,
    ];
  },

  yRotation: function(angleInRadians) {
    var c = Math.cos(angleInRadians);
    var s = Math.sin(angleInRadians);

    return [
      c, 0, -s, 0,
      0, 1, 0, 0,
      s, 0, c, 0,
      0, 0, 0, 1,
    ];
  },

  zRotation: function(angleInRadians) {
    var c = Math.cos(angleInRadians);
    var s = Math.sin(angleInRadians);

    return [
       c, s, 0, 0,
      -s, c, 0, 0,
       0, 0, 1, 0,
       0, 0, 0, 1,
    ];
  },

  scaling: function(sx, sy, sz) {
    return [
      sx, 0,  0,  0,
      0, sy,  0,  0,
      0,  0, sz,  0,
      0,  0,  0,  1,
    ];
  },

  translate: function(m, tx, ty, tz) {
    return m4.multiply(m, m4.translation(tx, ty, tz));
  },

  xRotate: function(m, angleInRadians) {
    return m4.multiply(m, m4.xRotation(angleInRadians));
  },

  yRotate: function(m, angleInRadians) {
    return m4.multiply(m, m4.yRotation(angleInRadians));
  },

  zRotate: function(m, angleInRadians) {
    return m4.multiply(m, m4.zRotation(angleInRadians));
  },

  scale: function(m, sx, sy, sz) {
    return m4.multiply(m, m4.scaling(sx, sy, sz));
  },

};

function radToDeg(r) {
  return r * 180 / Math.PI;
}

function degToRad(d) {
  return d * Math.PI / 180;
}

function fillBuffers() {


}

  // Draw the scene.
  function drawScene(renderer, callback) {

    var m, mesh, t, tl, triangle, l, light,
        attribute, uniform, buffer, data, location,
        update = false, lights = scene.lights.length,
        index, v,vl,vetex,vertexCount = 0;


    // Clear the canvas AND the depth buffer.
    //gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Turn on culling. By default backfacing triangles
    // will be culled.
    gl.enable(gl.CULL_FACE);

    // Enable the depth buffer
    gl.enable(gl.DEPTH_TEST);

    // Compute the matrices
    var matrix = m4.projection(bufferWidth, bufferHeight, 400);

    Logger.debug('start draw scene gl errors=',gl.getError());


    // Create a buffer to put positions in
    positionBuffer = gl.createBuffer();
    // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    // Put geometry data into buffer
    //setGeometry(gl);
    var numVertices = initVertexField(gl,false);


    // Turn on the position attribute
    //gl.enableVertexAttribArray(program.attributes.position.buffer);

    // Turn on the color attribute
    //gl.enableVertexAttribArray(colorLocation);
    //gl.enableVertexAttribArray(program.attributes.position.buffer);



    // Bind the position buffer.
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    // Tell the position attribute how to get data out of positionBuffer (ARRAY_BUFFER)
    var size = 3;          // 3 components per iteration
    var type = gl.FLOAT;   // the data is 32bit floats
    var normalize = false; // don't normalize the data
    var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
    var offset = 0;        // start at the beginning of the buffer
    gl.vertexAttribPointer(positionLocation, size, type, normalize, stride, offset);

/*
    // Bind the color buffer.
    gl.bindBuffer(gl.ARRAY_BUFFER, verticeColorBufferObject);

    // Tell the attribute how to get data out of colorBuffer (ARRAY_BUFFER)
    var size = 4;                 // 3 components per iteration
    var type = gl.FLOAT;          // the data is 32bit floats
    var normalize = false;         // normalize the data (convert from 0-255 to 0-1)
    var stride = 0;               // 0 = move forward size * sizeof(type) each iteration to get the next position
    var offset = 0;               // start at the beginning of the buffer
    gl.vertexAttribPointer(
        colorLocation, size, type, normalize, stride, offset)
*/

/*
    // Tell the attribute how to get data out of colorBuffer (ARRAY_BUFFER)
    var size = 3;                 // 3 components per iteration
    var type = gl.UNSIGNED_BYTE;  // the data is 8bit unsigned values
    var normalize = true;         // normalize the data (convert from 0-255 to 0-1)
    var stride = 0;               // 0 = move forward size * sizeof(type) each iteration to get the next position
    var offset = 0;               // start at the beginning of the buffer
    gl.vertexAttribPointer(
        colorLocation, size, type, normalize, stride, offset)

*/


//   	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // 16 faces = 16 x 2 triangles = 32
//    gl.drawArrays(gl.TRIANGLE_STRIP, 0, numVertices);
gl.drawArrays(gl.LINE_STRIP, 0, numVertices);

    //   	gl.drawArrays(gl.TRIANGLES, 0, 16*6);

    // Increment vertex counter
    for (m = scene.meshes.length - 1; m >= 0; m--) {
      mesh = scene.meshes[m];
      if (mesh.geometry.dirty) update = true;
      mesh.update(this, scene.lights, false);
      vertexCount += mesh.geometry.triangles.length*3;
    }

    // Build buffers
    for (attribute in renderer.program.attributes) {
      buffer = renderer.program.attributes[attribute];
      buffer.data = new FSS.Array(vertexCount*buffer.size);

      // Reset vertex index
      index = 0;

      // Update attribute buffer data
      for (m = scene.meshes.length - 1; m >= 0; m--) {
        mesh = scene.meshes[m];

        for (t = 0, tl = mesh.geometry.triangles.length; t < tl; t++) {
          triangle = mesh.geometry.triangles[t];

          for (v = 0, vl = triangle.vertices.length; v < vl; v++) {
            var vertex = triangle.vertices[v];

            FSS.Vector4.set(triangle.color.rgba, 1, 0, 1, 1);

            switch (attribute) {
              case 'side':
                //renderer.setBufferData(index, buffer, mesh.side);
                //Logger.debug('mesh side=', mesh.side);
                break;
              case 'position':
                renderer.setBufferData(index, buffer, vertex.position);
                //Logger.debug('vertex position=', vertex.position);
                break;
              case 'centroid':
                //renderer.setBufferData(index, buffer, triangle.centroid);
                break;
              case 'normal':
                //renderer.setBufferData(index, buffer, triangle.normal);
                break;
              case 'ambient':
                //this.setBufferData(index, buffer, mesh.material.ambient.rgba);
                //renderer.setBufferData(index, buffer, triangle.color.rgba);
                break;
              case 'diffuse':
                //this.setBufferData(index, buffer, mesh.material.diffuse.rgba);
                //renderer.setBufferData(index, buffer, triangle.color.rgba);
                //Logger.debug('triangle.color.rgba=', triangle.color.rgba);
                break;
            index++;
          }
        }
      }

      // Upload attribute buffer data
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer.buffer);
      Logger.debug('bindBuffer gl errors=',gl.getError());
      gl.bufferData(gl.ARRAY_BUFFER, buffer.data, gl.DYNAMIC_DRAW);
      Logger.debug('bufferData gl errors=',gl.getError());


      gl.enableVertexAttribArray(buffer.location);
      Logger.debug('enableVertexAttribArray gl errors=',gl.getError());
      gl.vertexAttribPointer(buffer.location, buffer.size, gl.FLOAT, false, 0, 0);
      Logger.debug('vertexAttribPointer gl errors=',gl.getError());
    }
  }

  // Build uniform buffers
  //this.setBufferData(0, this.program.uniforms.resolution, [0, 0, this.width]);
  //renderer.setBufferData(0, renderer.program.uniforms.resolution, [renderer.width, renderer.height, renderer.width]);

/*  for (l = lights-1; l >= 0; l--) {
    light = scene.lights[l];
    renderer.setBufferData(l, renderer.program.uniforms.lightPosition, light.position);
    renderer.setBufferData(l, renderer.program.uniforms.lightAmbient, light.ambient.rgba);
    renderer.setBufferData(l, renderer.program.uniforms.lightDiffuse, light.diffuse.rgba);
  }*/

  //buffer = renderer.program.uniform[attribute];
  //renderer.program.uniforms.matrix.buffer.data = new FSS.Array(renderer.program.uniforms.matrix.buffer.size);
  //renderer.setBufferData(1, renderer.program.uniforms.matrix, matrix);


  // Update uniforms
  for (uniform in renderer.program.uniforms) {
    buffer = renderer.program.uniforms[uniform];
    location = buffer.location;
    data = buffer.data;
    switch (buffer.structure) {
      case '3f':
        gl.uniform3f(location, data[0], data[1], data[2]);
        break;
      case '3fv':
        gl.uniform3fv(location, data);
        break;
      case '4fv':
        gl.uniform4fv(location, data);
        break;
    }
  }

  rotation[0] += degToRad(0);
  rotation[1] += degToRad(0);
  rotation[2] += degToRad(0);
  translation[0] += 0.0;
  translation[0] -= 0.0;
  translation[2] += 0.0;
  scale[0] /= 1.00;
  scale[1] /= 1.00;
  scale[2] /= 1.00;
  Logger.debug('translation=',translation);
  Logger.debug('rotation=',rotation);
  Logger.debug('scale=',scale);

  matrix = m4.translate(matrix, translation[0], translation[1], translation[2]);
  matrix = m4.xRotate(matrix, rotation[0]);
  matrix = m4.yRotate(matrix, rotation[1]);
  matrix = m4.zRotate(matrix, rotation[2]);
  matrix = m4.scale(matrix, scale[0], scale[1], scale[2]);

  // Set the matrix.
  gl.uniformMatrix4fv(matrixLocation, false, matrix);
  Logger.debug('matrix=', matrix);


  Logger.debug('gl errors=',gl.getError());


  // Draw the geometry.
  var primitiveType = gl.TRIANGLES;
  var offset = 0;
  var count = vertexCount;//16 * 6;
  gl.drawArrays(primitiveType, offset, count);
  Logger.debug('WebGLRenderer # of vertices @', vertexCount);
  Logger.debug('WebGLRenderer draw arrays @', getDateTime());
  Logger.debug('gl errors=',gl.getError());


/*
//renderer.program.attributes.position.location,
  // Draw the geometry.
  //var primitiveType = gl.TRIANGLES;
  //var primitiveType = gl.TRIANGLE_STRIP;
  var primitiveType = gl.LINE_STRIP;
  var offset = 0;
  var count = numVertices;
  gl.drawArrays(primitiveType, offset, count);
  Logger.debug('WebGLRenderer # of vertices @', numVertices);
  Logger.debug('WebGLRenderer draw arrays @', getDateTime());
*/

  if (callback) {
    Logger.debug('Rendering callback defined.');
    // Notify callback of rendering completion
    callback();
  }  else {
    Logger.debug('No rendering callback defined.');
  }
}

var m4 = {

  projection: function(width, height, depth) {
    // Note: This matrix flips the Y axis so 0 is at the top.
    return [
       2 / width, 0, 0, 0,
       0, -2 / height, 0, 0,
       0, 0, 2 / depth, 0,
      -1, 1, 0, 1,
    ];
  },

  multiply: function(a, b) {
    var a00 = a[0 * 4 + 0];
    var a01 = a[0 * 4 + 1];
    var a02 = a[0 * 4 + 2];
    var a03 = a[0 * 4 + 3];
    var a10 = a[1 * 4 + 0];
    var a11 = a[1 * 4 + 1];
    var a12 = a[1 * 4 + 2];
    var a13 = a[1 * 4 + 3];
    var a20 = a[2 * 4 + 0];
    var a21 = a[2 * 4 + 1];
    var a22 = a[2 * 4 + 2];
    var a23 = a[2 * 4 + 3];
    var a30 = a[3 * 4 + 0];
    var a31 = a[3 * 4 + 1];
    var a32 = a[3 * 4 + 2];
    var a33 = a[3 * 4 + 3];
    var b00 = b[0 * 4 + 0];
    var b01 = b[0 * 4 + 1];
    var b02 = b[0 * 4 + 2];
    var b03 = b[0 * 4 + 3];
    var b10 = b[1 * 4 + 0];
    var b11 = b[1 * 4 + 1];
    var b12 = b[1 * 4 + 2];
    var b13 = b[1 * 4 + 3];
    var b20 = b[2 * 4 + 0];
    var b21 = b[2 * 4 + 1];
    var b22 = b[2 * 4 + 2];
    var b23 = b[2 * 4 + 3];
    var b30 = b[3 * 4 + 0];
    var b31 = b[3 * 4 + 1];
    var b32 = b[3 * 4 + 2];
    var b33 = b[3 * 4 + 3];
    return [
      b00 * a00 + b01 * a10 + b02 * a20 + b03 * a30,
      b00 * a01 + b01 * a11 + b02 * a21 + b03 * a31,
      b00 * a02 + b01 * a12 + b02 * a22 + b03 * a32,
      b00 * a03 + b01 * a13 + b02 * a23 + b03 * a33,
      b10 * a00 + b11 * a10 + b12 * a20 + b13 * a30,
      b10 * a01 + b11 * a11 + b12 * a21 + b13 * a31,
      b10 * a02 + b11 * a12 + b12 * a22 + b13 * a32,
      b10 * a03 + b11 * a13 + b12 * a23 + b13 * a33,
      b20 * a00 + b21 * a10 + b22 * a20 + b23 * a30,
      b20 * a01 + b21 * a11 + b22 * a21 + b23 * a31,
      b20 * a02 + b21 * a12 + b22 * a22 + b23 * a32,
      b20 * a03 + b21 * a13 + b22 * a23 + b23 * a33,
      b30 * a00 + b31 * a10 + b32 * a20 + b33 * a30,
      b30 * a01 + b31 * a11 + b32 * a21 + b33 * a31,
      b30 * a02 + b31 * a12 + b32 * a22 + b33 * a32,
      b30 * a03 + b31 * a13 + b32 * a23 + b33 * a33,
    ];
  },

  translation: function(tx, ty, tz) {
    return [
       1,  0,  0,  0,
       0,  1,  0,  0,
       0,  0,  1,  0,
       tx, ty, tz, 1,
    ];
  },

  xRotation: function(angleInRadians) {
    var c = Math.cos(angleInRadians);
    var s = Math.sin(angleInRadians);

    return [
      1, 0, 0, 0,
      0, c, s, 0,
      0, -s, c, 0,
      0, 0, 0, 1,
    ];
  },

  yRotation: function(angleInRadians) {
    var c = Math.cos(angleInRadians);
    var s = Math.sin(angleInRadians);

    return [
      c, 0, -s, 0,
      0, 1, 0, 0,
      s, 0, c, 0,
      0, 0, 0, 1,
    ];
  },

  zRotation: function(angleInRadians) {
    var c = Math.cos(angleInRadians);
    var s = Math.sin(angleInRadians);

    return [
       c, s, 0, 0,
      -s, c, 0, 0,
       0, 0, 1, 0,
       0, 0, 0, 1,
    ];
  },

  scaling: function(sx, sy, sz) {
    return [
      sx, 0,  0,  0,
      0, sy,  0,  0,
      0,  0, sz,  0,
      0,  0,  0,  1,
    ];
  },

  translate: function(m, tx, ty, tz) {
    return m4.multiply(m, m4.translation(tx, ty, tz));
  },

  xRotate: function(m, angleInRadians) {
    return m4.multiply(m, m4.xRotation(angleInRadians));
  },

  yRotate: function(m, angleInRadians) {
    return m4.multiply(m, m4.yRotation(angleInRadians));
  },

  zRotate: function(m, angleInRadians) {
    return m4.multiply(m, m4.zRotation(angleInRadians));
  },

  scale: function(m, sx, sy, sz) {
    return m4.multiply(m, m4.scaling(sx, sy, sz));
  },

};

var perspective=0;
var cols=50, rows=50;
var gx,  gy;
var gheight;
var triangleStripArray = new Array();
var totverticesTS=0;
var vertixx =  new Float32Array(rows*cols);
var vertixy = new Float32Array(rows*cols);
var vertixz = new Float32Array(rows*cols);
var verticeBufferObject;
var verticeColorBufferObject;

function initVertexField(gl, reuse) {


  gx=25;
  gy=25;
	gheight=25;

	var i=0, j=0;
	var index=0;
	var totverticesRC=2*cols*(rows-1) ;
	var totverticesTS=2*cols*(rows-1)+2*(rows-2) ;
  var numVertices=totverticesTS;

  if (!reuse) {

	var verticesArray =new Float32Array(3*totverticesTS);//42);
//	var verticeColorArray =new Float32Array(4*totverticesTS);

	for( var row =1;row<=rows;row++)
	for(var col=1;col<= cols;col++)
	{
//			vertixx[j]=gx*col;
//			vertixy[j]=gy*row;
      vertixx[j]=(gx*col)+getRandomArbitrary(1, 5);
			vertixy[j]=(gy*row)+getRandomArbitrary(1, 5);

      vertixz[j] =getRandomArbitrary(1, 40);

      /*if(zzTop[j]>0) vertixz[j] =0.0;
			else if(perspective) 	vertixz[j]= -1*zzTop[j];
			else 	vertixz[j]= -2*zzTop[j];*/
			j++;
	}

	j=0;
	for(i=1;i<=totverticesRC;i+=2)
	{
			triangleStripArray[ j ]=(1 +i)/2;  //ODD
			triangleStripArray[ j +1 ]=(cols*2+i+1)/2;//EVEN
				if(  triangleStripArray[ j +1 ]%cols==0) //check for end of col
			{
				if( triangleStripArray[ j +1 ]!=cols && triangleStripArray[ j +1 ]!=cols*rows )
				{
					triangleStripArray[ j +2 ]=triangleStripArray[ j +1 ];
					triangleStripArray[ j +3 ]=(1 +i+2)/2;
					j+=2;
				}
			}
			j+=2;
	}


	var k=0,n=0;
	j=0;
	for(i=0;i<triangleStripArray.length; i++)
	{
		index=triangleStripArray[j];
		j++;

		verticesArray[k++]=vertixx[index-1];
		verticesArray[k++]=vertixy[index-1];
		verticesArray[k++]=vertixz[index-1];
		 if ( vertixz[index-1]  >=gheight )
		 {
	//		verticeColorArray[n++]=0.0;
//		 	verticeColorArray[n++]=0.0;
	//		verticeColorArray[n++]=1.0;
		}
		else
		{
	//		verticeColorArray[n++]=1.0;
//			verticeColorArray[n++]=0.0;
//			verticeColorArray[n++]=0.0;
		}
//			verticeColorArray[n++]=1.0;
	}

 	//verticeBufferObject=gl.createBuffer();
  //verticeColorBufferObject=gl.createBuffer();
}

	//gl.bindBuffer(gl.ARRAY_BUFFER, verticeBufferObject);
	//gl.bufferData(gl.ARRAY_BUFFER, verticesArray, gl.STATIC_DRAW);

  gl.bufferData(gl.ARRAY_BUFFER, verticesArray, gl.STATIC_DRAW);


//  return verticesArray;

//	gl.bindBuffer(gl.ARRAY_BUFFER, verticeColorBufferObject);
//	gl.bufferData(gl.ARRAY_BUFFER, verticeColorArray, gl.STATIC_DRAW);

  return numVertices;
}


function initVertexField2(gl, reuse) {


  gx=25;
  gy=25;
	gheight=25;

	var i=0, j=0;
	var index=0;
	var totverticesRC=2*cols*(rows-1) ;
	var totverticesTS=2*cols*(rows-1)+2*(rows-2) ;
  var numVertices=totverticesTS;

  if (!reuse) {

	var verticeArray =new Float32Array(3*totverticesTS);//42);
	var verticeColorArray =new Float32Array(4*totverticesTS);

	for( var row =1;row<=rows;row++)
	for(var col=1;col<= cols;col++)
	{
			vertixx[j]=gx*col;
			vertixy[j]=gy*row;
      vertixz[j] =getRandomArbitrary(1, 40);

      /*if(zzTop[j]>0) vertixz[j] =0.0;
			else if(perspective) 	vertixz[j]= -1*zzTop[j];
			else 	vertixz[j]= -2*zzTop[j];*/
			j++;
	}

	j=0;
	for(i=1;i<=totverticesRC;i+=2)
	{
			triangleStripArray[ j ]=(1 +i)/2;  //ODD
			triangleStripArray[ j +1 ]=(cols*2+i+1)/2;//EVEN
				if(  triangleStripArray[ j +1 ]%cols==0) //check for end of col
			{
				if( triangleStripArray[ j +1 ]!=cols && triangleStripArray[ j +1 ]!=cols*rows )
				{
					triangleStripArray[ j +2 ]=triangleStripArray[ j +1 ];
					triangleStripArray[ j +3 ]=(1 +i+2)/2;
					j+=2;
				}
			}
			j+=2;
	}
	var k=0,n=0;
	j=0;
	for(i=0;i<triangleStripArray.length; i++)
	{
		index=triangleStripArray[j];
		j++;

		verticeArray[k++]=vertixx[index-1];
		verticeArray[k++]=vertixy[index-1];
		verticeArray[k++]=vertixz[index-1];
		 if ( vertixz[index-1]  >=gheight )
		 {
			verticeColorArray[n++]=0.0;
		 	verticeColorArray[n++]=0.0;
			verticeColorArray[n++]=1.0;
		}
		else
		{
			verticeColorArray[n++]=1.0;
			verticeColorArray[n++]=0.0;
			verticeColorArray[n++]=0.0;
		}
			verticeColorArray[n++]=1.0;
	}

 	verticeBufferObject=gl.createBuffer();
  verticeColorBufferObject=gl.createBuffer();
}

	gl.bindBuffer(gl.ARRAY_BUFFER, verticeBufferObject);
	gl.bufferData(gl.ARRAY_BUFFER, verticeArray, gl.STATIC_DRAW);


	gl.bindBuffer(gl.ARRAY_BUFFER, verticeColorBufferObject);
	gl.bufferData(gl.ARRAY_BUFFER, verticeColorArray, gl.STATIC_DRAW);

  return numVertices;
}


// Fill the buffer with the values that define a letter 'F'.
function setGeometry(gl) {

  var f32Arr = initializeGrid(4, 3);
  gl.bufferData(gl.ARRAY_BUFFER, f32Arr, gl.STATIC_DRAW);

}
/*
  for (var i = 0; i < f32Arr.length; i += 3) {
    f32Arr[i] = 0; // x
    f32Arr[i+1] = 0; // y
    f32Arr[i+2] = 0; // z
  }*/


  // Fill the buffer with the values that define a letter 'F'.
  function setGeometry2(gl) {


  gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
          // left column front
          0,   0,  0,
          0, 150,  0,
          30,   0,  0,
          0, 150,  0,
          30, 150,  0,
          30,   0,  0,

          // top rung front
          30,   0,  0,
          30,  30,  0,
          100,   0,  0,
          30,  30,  0,
          100,  30,  0,
          100,   0,  0,

          // middle rung front
          30,  60,  0,
          30,  90,  0,
          67,  60,  0,
          30,  90,  0,
          67,  90,  0,
          67,  60,  0,

          // left column back
            0,   0,  30,
           30,   0,  30,
            0, 150,  30,
            0, 150,  30,
           30,   0,  30,
           30, 150,  30,

          // top rung back
           30,   0,  30,
          100,   0,  30,
           30,  30,  30,
           30,  30,  30,
          100,   0,  30,
          100,  30,  30,

          // middle rung back
           30,  60,  30,
           67,  60,  30,
           30,  90,  30,
           30,  90,  30,
           67,  60,  30,
           67,  90,  30,

          // top
            0,   0,   0,
          100,   0,   0,
          100,   0,  30,
            0,   0,   0,
          100,   0,  30,
            0,   0,  30,

          // top rung right
          100,   0,   0,
          100,  30,   0,
          100,  30,  30,
          100,   0,   0,
          100,  30,  30,
          100,   0,  30,

          // under top rung
          30,   30,   0,
          30,   30,  30,
          100,  30,  30,
          30,   30,   0,
          100,  30,  30,
          100,  30,   0,

          // between top rung and middle
          30,   30,   0,
          30,   60,  30,
          30,   30,  30,
          30,   30,   0,
          30,   60,   0,
          30,   60,  30,

          // top of middle rung
          30,   60,   0,
          67,   60,  30,
          30,   60,  30,
          30,   60,   0,
          67,   60,   0,
          67,   60,  30,

          // right of middle rung
          67,   60,   0,
          67,   90,  30,
          67,   60,  30,
          67,   60,   0,
          67,   90,   0,
          67,   90,  30,

          // bottom of middle rung.
          30,   90,   0,
          30,   90,  30,
          67,   90,  30,
          30,   90,   0,
          67,   90,  30,
          67,   90,   0,

          // right of bottom
          30,   90,   0,
          30,  150,  30,
          30,   90,  30,
          30,   90,   0,
          30,  150,   0,
          30,  150,  30,

          // bottom
          0,   150,   0,
          0,   150,  30,
          30,  150,  30,
          0,   150,   0,
          30,  150,  30,
          30,  150,   0,

          // left side
          0,   0,   0,
          0,   0,  30,
          0, 150,  30,
          0,   0,   0,
          0, 150,  30,
          0, 150,   0]),
      gl.STATIC_DRAW);
}

// Fill the buffer with colors for the 'F'.
function setColors(gl) {

  var int8Arr = initializeColorGrid(4, 3);
  gl.bufferData(gl.ARRAY_BUFFER, int8Arr, gl.STATIC_DRAW);

}

// Fill the buffer with colors for the 'F'.
function setColors2(gl) {

  gl.bufferData(
      gl.ARRAY_BUFFER,
      new Uint8Array([
          // left column front
        200,  70, 120,
        200,  70, 120,
        200,  70, 120,
        200,  70, 120,
        200,  70, 120,
        200,  70, 120,

          // top rung front
        200,  70, 120,
        200,  70, 120,
        200,  70, 120,
        200,  70, 120,
        200,  70, 120,
        200,  70, 120,

          // middle rung front
        200,  70, 120,
        200,  70, 120,
        200,  70, 120,
        200,  70, 120,
        200,  70, 120,
        200,  70, 120,

          // left column back
        80, 70, 200,
        80, 70, 200,
        80, 70, 200,
        80, 70, 200,
        80, 70, 200,
        80, 70, 200,

          // top rung back
        80, 70, 200,
        80, 70, 200,
        80, 70, 200,
        80, 70, 200,
        80, 70, 200,
        80, 70, 200,

          // middle rung back
        80, 70, 200,
        80, 70, 200,
        80, 70, 200,
        80, 70, 200,
        80, 70, 200,
        80, 70, 200,

          // top
        70, 200, 210,
        70, 200, 210,
        70, 200, 210,
        70, 200, 210,
        70, 200, 210,
        70, 200, 210,

          // top rung right
        200, 200, 70,
        200, 200, 70,
        200, 200, 70,
        200, 200, 70,
        200, 200, 70,
        200, 200, 70,

          // under top rung
        210, 100, 70,
        210, 100, 70,
        210, 100, 70,
        210, 100, 70,
        210, 100, 70,
        210, 100, 70,

          // between top rung and middle
        210, 160, 70,
        210, 160, 70,
        210, 160, 70,
        210, 160, 70,
        210, 160, 70,
        210, 160, 70,

          // top of middle rung
        70, 180, 210,
        70, 180, 210,
        70, 180, 210,
        70, 180, 210,
        70, 180, 210,
        70, 180, 210,

          // right of middle rung
        100, 70, 210,
        100, 70, 210,
        100, 70, 210,
        100, 70, 210,
        100, 70, 210,
        100, 70, 210,

          // bottom of middle rung.
        76, 210, 100,
        76, 210, 100,
        76, 210, 100,
        76, 210, 100,
        76, 210, 100,
        76, 210, 100,

          // right of bottom
        140, 210, 80,
        140, 210, 80,
        140, 210, 80,
        140, 210, 80,
        140, 210, 80,
        140, 210, 80,

          // bottom
        90, 130, 110,
        90, 130, 110,
        90, 130, 110,
        90, 130, 110,
        90, 130, 110,
        90, 130, 110,

          // left side
        160, 160, 220,
        160, 160, 220,
        160, 160, 220,
        160, 160, 220,
        160, 160, 220,
        160, 160, 220]),
      gl.STATIC_DRAW);
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

function loadLib(inputFile) {
  initialise(inputFile);
}
exports.loadLib = loadLib;

})();
