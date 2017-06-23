/**

The MIT License (MIT)

Copyright (c) 2014 Maksim Surguy

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
(function() {
  "use strict";

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
})();

//

var Canvas = require('canvas');
Image = Canvas.Image;

/**
 * Defines the Flat Surface Shader namespace for all the awesomeness to exist upon.
 * @author Matthew Wagerfield
 */
FSS = {
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
  this.polygon = document.createElementNS(FSS.SVGNS, 'polygon');
  this.polygon.setAttributeNS(null, 'stroke-linejoin', 'round');
  this.polygon.setAttributeNS(null, 'stroke-miterlimit', '1');
  this.polygon.setAttributeNS(null, 'stroke-width', '1');
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
      //console.log('Recalculating triangle centroids and normals.');
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
    offsetX = this.width * -0.5,
    offsetY = this.height * 0.5;

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
        console.log('Feature points added.');
      }
    }

  } else {
    // No image loaded
    console.log('No image loaded, not adding feature points.');
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
    v1 = new FSS.Vertex(Math.ceil(vertices[triangles[i]][0]), Math.ceil(vertices[triangles[i]][1]));
    --i;
    v2 = new FSS.Vertex(Math.ceil(vertices[triangles[i]][0]), Math.ceil(vertices[triangles[i]][1]));
    --i;
    v3 = new FSS.Vertex(Math.ceil(vertices[triangles[i]][0]), Math.ceil(vertices[triangles[i]][1]));
    t1 = new FSS.Triangle(v1,v2,v3);
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

    //console.log('bBox=',this.getBBox());

    // Iterate through Triangles
    for (t = this.geometry.triangles.length - 1; t >= 0; t--) {
      triangle = this.geometry.triangles[t];

      // Reset Triangle Color
      //FSS.Vector4.set(triangle.color.rgba);
      triangle.color = getTriangleColor(triangle.centroid, this.getBBox(), renderer);
      //triangle.color = new FSS.Color(rgbToHex(255, 0, 255), 1);

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

    for (i = 0; i < 2; i++) {
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
 * @class Canvas Renderer
 * @author Matthew Wagerfield
 */
FSS.CanvasRenderer = function() {
  FSS.Renderer.call(this);
  this.element = document.createElement('canvas');
  this.element.style.display = 'block';
  this.context = this.element.getContext('2d');
  this.setSize(this.element.width, this.element.height);
};

FSS.CanvasRenderer.prototype = Object.create(FSS.Renderer.prototype);

FSS.CanvasRenderer.prototype.setSize = function(width, height) {
  FSS.Renderer.prototype.setSize.call(this, width, height);
  this.element.width = width;
  this.element.height = height;
  this.context.setTransform(1, 0, 0, -1, this.halfWidth, this.halfHeight);
  return this;
};

FSS.CanvasRenderer.prototype.clear = function() {
  FSS.Renderer.prototype.clear.call(this);
  this.context.clearRect(-this.halfWidth, -this.halfHeight, this.width, this.height);
  return this;
};

FSS.CanvasRenderer.prototype.render = function(scene) {
  FSS.Renderer.prototype.render.call(this, scene);
  var m,mesh, t,triangle, color;

  // Clear Context
  this.clear();

  // Configure Context
  this.context.lineJoin = 'round';
  this.context.lineWidth = 1;

  // Update Meshes
  for (m = scene.meshes.length - 1; m >= 0; m--) {
    mesh = scene.meshes[m];
    if (mesh.visible) {
      mesh.update(this, scene.lights, true);

      // Render Triangles
      for (t = mesh.geometry.triangles.length - 1; t >= 0; t--) {
        triangle = mesh.geometry.triangles[t];
        color = triangle.color.format();
        this.context.beginPath();
        this.context.moveTo(triangle.a.position[0], triangle.a.position[1]);
        this.context.lineTo(triangle.b.position[0], triangle.b.position[1]);
        this.context.lineTo(triangle.c.position[0], triangle.c.position[1]);
        this.context.closePath();
        this.context.strokeStyle = color;
        this.context.fillStyle = color;
        this.context.stroke();
        this.context.fill();
      }
    }
  }
  return this;
};

/**
 * @class WebGL Renderer
 * @author Matthew Wagerfield
 */
FSS.WebGLRenderer = function() {
  FSS.Renderer.call(this);
  this.element = document.createElement('canvas');
  this.element.style.display = 'block';

  // Set initial vertex and light count
  this.vertices = null;
  this.lights = null;

  // Create parameters object
  var parameters = {
    preserveDrawingBuffer: false,
    premultipliedAlpha: true,
    antialias: true,
    stencil: true,
    alpha: true
  };

  // Create and configure the gl context
  this.gl = this.getContext(this.element, parameters);

  // Set the internal support flag
  this.unsupported = !this.gl;

  // Setup renderer
  if (this.unsupported) {
    return 'WebGL is not supported by your browser.';
  } else {
    this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
    this.gl.enable(this.gl.DEPTH_TEST);
    this.setSize(this.element.width, this.element.height);
  }
};

FSS.WebGLRenderer.prototype = Object.create(FSS.Renderer.prototype);

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
  this.element.width = width;
  this.element.height = height;

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
              vertex = triangle.vertices[v];
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

/**
 * @class SVG Renderer
 * @author Matthew Wagerfield
 */
FSS.SVGRenderer = function() {
  FSS.Renderer.call(this);
  this.element = document.createElementNS(FSS.SVGNS, 'svg');
  this.element.setAttribute('xmlns', FSS.SVGNS);
  this.element.setAttribute('version', '1.1');
  this.element.style.display = 'block';
  this.setSize(300, 150);
};

FSS.SVGRenderer.prototype = Object.create(FSS.Renderer.prototype);

FSS.SVGRenderer.prototype.setSize = function(width, height) {
  FSS.Renderer.prototype.setSize.call(this, width, height);
  this.element.setAttribute('width', width);
  this.element.setAttribute('height', height);
  return this;
};

FSS.SVGRenderer.prototype.clear = function() {
  FSS.Renderer.prototype.clear.call(this);
  for (var i = this.element.childNodes.length - 1; i >= 0; i--) {
    this.element.removeChild(this.element.childNodes[i]);
  }
  return this;
};

FSS.SVGRenderer.prototype.render = function(scene) {
  FSS.Renderer.prototype.render.call(this, scene);
  var m,mesh, t,triangle, points, style;

  // Update Meshes
  for (m = scene.meshes.length - 1; m >= 0; m--) {
    mesh = scene.meshes[m];
    if (mesh.visible) {
      mesh.update(scene.lights, true);

      // Render Triangles
      for (t = mesh.geometry.triangles.length - 1; t >= 0; t--) {
        triangle = mesh.geometry.triangles[t];
        if (triangle.polygon.parentNode !== this.element) {
          this.element.appendChild(triangle.polygon);
        }
        points  = this.formatPoint(triangle.a)+' ';
        points += this.formatPoint(triangle.b)+' ';
        points += this.formatPoint(triangle.c);
        style = this.formatStyle(triangle.color.format());
        triangle.polygon.setAttributeNS(null, 'points', points);
        triangle.polygon.setAttributeNS(null, 'style', style);
      }
    }
  }
  return this;
};

FSS.SVGRenderer.prototype.formatPoint = function(vertex) {
  return (this.halfWidth+vertex.position[0])+','+(this.halfHeight-vertex.position[1]);
};

FSS.SVGRenderer.prototype.formatStyle = function(color) {
  var style = 'fill:'+color+';';
  style += 'stroke:'+color+';';
  return style;
};

var frames = [];
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

var playGIF = function(gif, preview) {

  var stream;
  var hdr;

  var loadError = null;

  var playing = true;
  var forward = true;

  var clear = function() {
    transparency = null;
    delay = null;
    lastDisposalMethod = disposalMethod;
    disposalMethod = null;
    frame = null;
    //frame = tmpCanvas.getContext('2d');
  };

  // XXX: There's probably a better way to handle catching exceptions when
  // callbacks are involved.
  var doParse = function() {
      try {
        parseGIF(stream, handler);
      } catch(err) {
        doLoadError('parse');
      }
  };

  var doGet = function() {

      console.log('doGet()');
      var h = new XMLHttpRequest();
      h.overrideMimeType('text/plain; charset=x-user-defined');
      h.onload = function(e) {

      console.log('Retrieving gif data...');
      console.log('h.status: ', h.status);

      if (h.status >= 200 && h.status < 400) {

        //data = JSON.parse(h.responseText).data.image_url;
        //console.log(data);
        //console.log(JSON.parse(h.responseText).data);

        // TODO: In IE, might be able to use h.responseBody instead of overrideMimeType.
        //console.log(h.responseText);

        //document.getElementById("giphyme").innerHTML = '<center><img src = "'+data+'"  title="GIF via Giphy"></center>';

        //doLoadProgress(e);
        stream = new Stream(h.responseText);
        setTimeout(doParse, 0);
        if (img != null) {
             img.src = gif.getAttribute("src");
        }

      } else {
        console.log('reached giphy, but API returned an error');
      }

      };

      h.onprogress = doLoadProgress;
      h.onerror = function() { doLoadError('xhr'); };
      console.log('gif: ', gif.getAttribute("src"));
      h.open('GET', gif.getAttribute("src"), true);
      h.send();

  };

  var doText = function(text) {
    toolbar.innerHTML = text; // innerText? Escaping? Whatever.
    //ctx.fillStyle = 'black';
    //ctx.font = '32px sans-serif';
    //ctx.fillText(text, 8, 32);
  };

  var doShowProgress = function(prefix, pos, length, draw) {
    //toolbar.style.display = pos === length ? 'none' : 'block';
    //toolbar.style.display = pos === length ? '' : 'block'; // FIXME Move this to doPlay() or something.
    toolbar.style.visibility = pos === length ? '' : 'visible'; // FIXME Move this to doPlay() or something.

    if (draw) {
      var height = Math.min(canvas.height >> 3, canvas.height);
      var top = (canvas.height - height) >> 1;
      var bottom = (canvas.height + height) >> 1;
      var mid = (pos / length) * canvas.width;

      // XXX Figure out alpha fillRect.
      //ctx.fillStyle = 'salmon';
      ctx.fillStyle = 'rgba(255,160,122,0.5)';
      ctx.fillRect(mid, top, canvas.width - mid, height);

      //ctx.fillStyle = 'teal';
      ctx.fillStyle = 'rgba(0,128,128,0.5)';
      ctx.fillRect(0, top, (pos / length) * canvas.width, height);
    }

    doText(prefix + ' ' + Math.floor(pos / length * 100) + '%');
  };

  var doLoadProgress = function(e) {
    // TODO: Find out what lengthComputable actually means.
    //if (e.lengthComputable) doShowProgress('Loading...', e.loaded, e.total, true);
  };

  var doLoadError = function(originOfError) {
    var drawError = function() {
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, hdr.width, hdr.height);
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 3;
      ctx.moveTo(0, 0);
      ctx.lineTo(hdr.width, hdr.height);
      ctx.moveTo(0, hdr.height);
      ctx.lineTo(hdr.width, 0);
      ctx.stroke();
    };

    loadError = originOfError;
    hdr = {width: gif.width, height: gif.height}; // Fake header.
    frames = [];
    drawError();
    setTimeout(doPlay, 0);
  };

  var doHdr = function(_hdr) {
    hdr = _hdr;
    //console.assert(gif.width === hdr.width && gif.height === hdr.height); // See other TODO.

    canvas.width = hdr.width;
    canvas.height = hdr.height;
    div.style.width = hdr.width + 'px';
    //div.style.height = hdr.height + 'px';
    toolbar.style.minWidth = hdr.width + 'px';

    tmpCanvas.width = hdr.width;
    tmpCanvas.height = hdr.height;
    //if (hdr.gctFlag) { // Fill background.
    //  rgb = hdr.gct[hdr.bgColor];
    //  tmpCanvas.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',');
    //}
    //tmpCanvas.getContext('2d').fillRect(0, 0, hdr.width, hdr.height);
    // TODO: Figure out the disposal method business.
  };

  var doGCE = function(gce) {
    pushFrame();
    clear();
    transparency = gce.transparencyGiven ? gce.transparencyIndex : null;
    delay = gce.delayTime;
    disposalMethod = gce.disposalMethod;
    // We don't have much to do with the rest of GCE.
  };

  var pushFrame = function() {
    if (!frame) return;
    frames.push({data: frame.getImageData(0, 0, hdr.width, hdr.height),
                 delay: delay});
  };

  var doImg = function(img) {
    if (!frame) frame = tmpCanvas.getContext('2d');
    var ct = img.lctFlag ? img.lct : hdr.gct; // TODO: What if neither exists?

    var cData = frame.getImageData(img.leftPos, img.topPos, img.width, img.height);

    img.pixels.forEach(function(pixel, i) {
      // cData.data === [R,G,B,A,...]
      if (transparency !== pixel) { // This includes null, if no transparency was defined.
        cData.data[i * 4 + 0] = ct[pixel][0];
        cData.data[i * 4 + 1] = ct[pixel][1];
        cData.data[i * 4 + 2] = ct[pixel][2];
        cData.data[i * 4 + 3] = 255; // Opaque.
      } else {
        // TODO: Handle disposal method properly.
        // XXX: When I get to an Internet connection, check which disposal method is which.
        if (lastDisposalMethod === 2 || lastDisposalMethod === 3) {
          cData.data[i * 4 + 3] = 0; // Transparent.
          // XXX: This is very very wrong.
        } else {
          // lastDisposalMethod should be null (no GCE), 0, or 1; leave the pixel as it is.
          // assert(lastDispsalMethod === null || lastDispsalMethod === 0 || lastDispsalMethod === 1);
          // XXX: If this is the first frame (and we *do* have a GCE),
          // lastDispsalMethod will be null, but we want to set undefined
          // pixels to the background color.
        }
      }
    });
    frame.putImageData(cData, img.leftPos, img.topPos);
    // We could use the on-page canvas directly, except that we draw a progress
    // bar for each image chunk (not just the final image).
    ctx.putImageData(cData, img.leftPos, img.topPos);

  /*      preview.src = img;

  // Image loaded
  var updateFrame = function() {
  */
  /*      var scale = Math.min( 150 / img.width, 150 / img.height );

    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height );
  */
    //var image_data = ctx.getImageData(0, 0, canvas.width, canvas.height);

    var image_data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    img.grayscale = new jsfeat.matrix_t(canvas.width, canvas.height, jsfeat.U8_t | jsfeat.C1_t);
    jsfeat.imgproc.grayscale(image_data.data, canvas.width, canvas.height, img.grayscale);

    img.loaded = true;

  //  };

  };

  var doPlay = (function() {
      var i = -1;
      var delayInfo;
      var curFrame;

      var showingInfo = false;
      var pinned = false;

      var stepFrame = function(delta) { // XXX: Name is confusing.
        i = (i + delta + frames.length) % frames.length;
        curFrame.value = i + 1;
        delayInfo.value = frames[i].delay;
        putFrame();
      };

      var step = (function() {
        var stepping = false;

        var doStep = function() {
          stepping = playing;
          if (!stepping) return;

          stepFrame(forward ? 1 : -1);
          var delay = frames[i].delay * 1;
          if (!delay) delay = 1; // FIXME: Should this even default at all? What should it be?
          setTimeout(doStep, delay);
        };

        return function() { if (!stepping) setTimeout(doStep, 0); };
      }());

      var putFrame = function() {
        ctx.putImageData(frames[i].data, 0, 0);

        // Store frame number
        curFrameNum = curFrame.value;

        img.loaded = true;

        if (window.updateRenderer) {
          // Update renderer with new frame
          window.updateRenderer();
        }

        //console.log('Updated to frame #:', curFrame.value);
      };

      var initToolbar = function() {
        // Characters.
        var right = '&#9654;';
        var left = '&#9664;';
        var bar = '&#10073;';
        var rarr = '&rarr;';
        var larr = '&larr;';
        var xsign = '&#10006;';
        //var infosource = '&#8505;';
        var circle = '&#9675;';
        var circledot = '&#8857;';
        //var blackSquare = '&#9632;'; // XXX
        //var doubleVerticalLine = '&#8214;'; // XXX
        var nearr = '&nearr;';
        // Buttons.
        var playIcon = right;
        var pauseIcon = bar + bar;
        var revplayIcon = left;
        var prevIcon = left + bar;
        var nextIcon = bar + right;
        //var showInfoIcon = infosource;
        var showInfoIcon = 'i'; // Fonts.
        var revIcon = larr;
        var revrevIcon = rarr;
        var closeIcon = xsign;
        var pinIcon = circledot;
        var unpinIcon = circle;
        var popupIcon = nearr;

        /**
         * @param{Object=} attrs Attributes (optional).
         */ // Make compiler happy.
        var elt = function(tag, cls, attrs) {
          var e = document.createElement(tag);
          if (cls) e.className = 'jsgif_' + cls;
          for (var k in attrs) {
            e[k] = attrs[k];
          }
          return e;
        };

        var simpleTools = elt('div', 'simple_tools');
        var rev = elt('button', 'rev');
        var showInfo = elt('button', 'show_info');
        var prev = elt('button', 'prev');
        var playPause = elt('button', 'play_pause');
        var next = elt('button', 'next');
        var pin = elt('button', 'pin');
        var close = elt('button', 'close');

        var infoTools = elt('div', 'info_tools');
        curFrame = elt('input', 'cur_frame', {type: 'text'}); // See above.
        delayInfo = elt('input', 'delay_info', {type: 'text'}); // See above.

        var updateTools = function() {
          if (playing) {
            playPause.innerHTML = pauseIcon;
              playPause.title = 'Pause'
            prev.style.visibility = 'hidden'; // See TODO.
            next.style.visibility = 'hidden';
          } else {
            playPause.innerHTML = forward ? playIcon : revplayIcon;
              playPause.title = 'Play';
            prev.style.visibility = '';
            next.style.visibility = '';
          }

          toolbar.style.visibility = pinned ? 'visible' : ''; // See TODO.

          infoTools.style.display = showingInfo ? '' : 'none'; // See TODO.

          showInfo.innerHTML = showInfoIcon;
            showInfo.title = 'Show info/more tools'
          rev.innerHTML = forward ? revIcon : revrevIcon;
            rev.title = forward ? 'Reverse' : 'Un-reverse';
          prev.innerHTML = prevIcon;
            prev.title = 'Previous frame';
          next.innerHTML = nextIcon;
            next.title = 'Next frame'
          pin.innerHTML = pinned ? unpinIcon : pinIcon;
            pin.title = pinned ? 'Unpin' : 'Pin';
          close.innerHTML = closeIcon;
            close.title = 'Close jsgif and go back to original image';

          curFrame.disabled = playing;
          delayInfo.disabled = playing;

          toolbar.innerHTML = '';
          simpleTools.innerHTML = '';
          infoTools.innerHTML = '';

          var t = function(text) { return document.createTextNode(text); };

          if (frames.length < 2) { // XXX
            // Also, this shouldn't actually be playing in this case.
            // TODO: Are we going to want an info tool that'll be displayed on static GIFs later?

            if (loadError == 'xhr') {
              toolbar.appendChild(t("Load failed; cross-domain? "));

              var popup = elt('button', 'popup');
              popup.addEventListener('click', function() { window.open(gif.src); } );
              popup.innerHTML = popupIcon;
                popup.title = 'Click to open GIF in new window; try running jsgif there instead';
              toolbar.appendChild(popup);
            } else if (loadError == 'parse') {
              toolbar.appendChild(t("Parse failed "));
            }

            toolbar.appendChild(close);

            return;
          }

          // We don't actually need to repack all of these -- that's left over
          // from before -- but it doesn't especially hurt either.
          var populate = function(elt, children) {
            elt.innerHTML = '';
            children.forEach(function(c) { elt.appendChild(c); });
            //children.forEach(elt.appendChild); // Is this a "pseudo-function"?
          };

          // XXX Blach.
          var simpleToolList = forward ? [showInfo, rev, prev, playPause, next, pin, close]
                                       : [showInfo, rev, next, playPause, prev, pin, close];
          populate(toolbar, [simpleTools, infoTools]);
          populate(simpleTools, simpleToolList);
          populate(infoTools, [t(' frame: '), curFrame, t(' / '), t(frames.length), t(' (delay: '), delayInfo, t(')')]);
        };

        var doRev = function() {
          forward = !forward;
          updateTools();
          rev.focus(); // (because repack)
        };

        var doNextFrame = function() { stepFrame(1); };
        var doPrevFrame = function() { stepFrame(-1); };

        var doPlayPause = function() {
          playing = !playing;
          updateTools();
          playPause.focus(); // In case this was called by clicking on the
                             // canvas (we have to do this here because we
                             // repack the buttons).
          step();
        };

        var doCurFrameChanged = function() {
          var newFrame = +curFrame.value;
          if (isNaN(newFrame) || newFrame < 1 || newFrame > frames.length) {
            // Invalid frame; put it back to what it was.
            curFrame.value = i + 1;
          } else {
            i = newFrame - 1;
            putFrame();
          }
        };

        var doCurDelayChanged = function() {
          var newDelay = +delayInfo.value;
          if (!isNaN(newDelay)) {
            frames[i].delay = newDelay;
          }
        };

        var doToggleShowingInfo = function() {
          showingInfo = !showingInfo;
          updateTools();
          showInfo.focus(); // (because repack)
        };

        var doTogglePinned = function() {
          pinned = !pinned;
          updateTools();
          pin.focus(); // (because repack)
        };

        // TODO: If the <img> was in an <a>, every one of these will go to the
        // URL. We don't want that for the buttons (and probably not for
        // anything?).
        showInfo.addEventListener('click', doToggleShowingInfo, false);
        rev.addEventListener('click', doRev, false);
        curFrame.addEventListener('change', doCurFrameChanged, false);
        prev.addEventListener('click', doPrevFrame, false);
        playPause.addEventListener('click', doPlayPause, false);
        next.addEventListener('click', doNextFrame, false);
        pin.addEventListener('click', doTogglePinned, false);
        close.addEventListener('click', doClose, false);

        delayInfo.addEventListener('change', doCurDelayChanged, false);

        canvas.addEventListener('click', doPlayPause, false);

        // For now, to handle GIFs in <a> tags and so on. This needs to be handled better, though.
        div.addEventListener('click', function(e) { e.preventDefault(); }, false);

        updateTools();
      };

      return function() {
        setTimeout(initToolbar, 0);
        if (loadError) return;
        canvas.width = hdr.width;
        canvas.height = hdr.height;
        step();
      };
  }());

  var doClose = function() {
    playing = false;
    parent.insertBefore(gif, div);
    parent.removeChild(div);
  };

  var doDecodeProgress = function(draw) {
    doShowProgress('Decoding (frame ' + (frames.length + 1) + ')...', stream.pos, stream.data.length, draw);
  };

  var doNothing = function(){};
  /**
   * @param{boolean=} draw Whether to draw progress bar or not; this is not idempotent because of translucency.
   *                       Note that this means that the text will be unsynchronized with the progress bar on non-frames;
   *                       but those are typically so small (GCE etc.) that it doesn't really matter. TODO: Do this properly.
   */
  var withProgress = function(fn, draw) {
    return function(block) {
      fn(block);
      doDecodeProgress(draw);
    };
  };

  var handler = {
    hdr: withProgress(doHdr),
    gce: withProgress(doGCE),
    com: withProgress(doNothing), // I guess that's all for now.
    app: {
     // TODO: Is there much point in actually supporting iterations?
      NETSCAPE: withProgress(doNothing)
    },
    img: withProgress(doImg, true),
    eof: function(block) {
      //toolbar.style.display = '';
      pushFrame();
      //console.log('Gif frames loaded.');
      //console.log(frames);
      doDecodeProgress(false);
      //doText('Playing...');
      console.log('Playing gif.');
      doPlay();
    }
  };

  var parent = gif.parentNode;

  //
  canvas = new Canvas(canvas.width, canvas.height);
  ctx = canvas.getContext('2d');

/*  fs.readFile(__dirname + '/images/squid.png', function(err, squid){
    if (err) throw err;
    img = new Image;
    img.src = squid;
    ctx.drawImage(img, 0, 0, img.width / 4, img.height / 4);
  });
*/
  var div = document.createElement('div');
  div.setAttribute("id", "tmp");
  var canvas = img.canvas;
  var ctx = img.context;
  var toolbar = document.createElement('div');
  toolbar.setAttribute("id", "tmp");

  var tmpCanvas = document.createElement('canvas');
  tmpCanvas.setAttribute("id", "tmp");

  // Copy the computed style of the <img> to the <div>. The CSS specifies
  // !important for all its properties; this still has a few issues, but it's
  // probably preferable to not doing it. XXX: Maybe this should only copy a
  // few specific properties (or specify properties more thoroughly in the
  // CSS)?
  // (If we don't hav getComputedStyle we'll have to get along without it, of
  // course. It's not as if this supports IE, anyway, though, so I don't know
  // if that really matters.)
  //
  // XXX: Commented out for now. If uncommenting, make sure to add !important
  // to all the CSS properties in jsgif.css
  //
  //if (window.getComputedStyle) {
  //  for (var s in window.getComputedStyle(gif)) {
  //    div.style[s] = gif.style[s];
  //  }
  //}

  // This is our first estimate for the size of the picture. It might have been
  // changed so we'll correct it when we parse the header. TODO: Handle zoom etc.
  canvas.width = gif.width;
  canvas.height = gif.height;
  toolbar.style.minWidth = gif.width + 'px';

  div.className = 'jsgif';
  toolbar.className = 'jsgif_toolbar';
  //div.appendChild(canvas);
  //div.appendChild(toolbar);

  //parent.insertBefore(div, gif);
  //parent.removeChild(gif);

  doText('Loading...');
  doGet();
};

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Returns a Vector4 rgba representing triangle color
function getTriangleColor(centroid, bBox, renderer) {
  //

  var count = 0;
  var gradientData = []

  // paint images
  if (this && img.loaded) {

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

    //console.log('bBox[0]=',bBox[0],'bBox[1]=',bBox[1],'bBox[1]-bBox[0]=',bBox[1]-bBox[0]);

    var sx = Math.floor(img.canvas.width * (x / (bBox[1]-bBox[0])));
    var sy = Math.floor(img.canvas.height * (y / (bBox[3]-bBox[2])));

    var iy = img.canvas.height-sy;
    //console.log('sx=',sx,'sy=',sy);
    var px = img.context.getImageData(sx, iy, 1, 1).data;

    //console.log('x=',x);
    //console.log('y=',y);
    //console.log('(x / renderer.width)=',(x / (bBox[1]-bBox[0]));
    //console.log('(y / renderer.height)=',(y / (bBox[3]-bBox[2])));

    //console.log('triangle color: ', px);
    // Return rgba

    //return new FSS.Color(ambient || '#FFFFFF');
    //return FSS.Vector4.create(px[0], px[1], px[2], 1);
    //this.rgba

    //console.log('triangle color: ', px);

    /*this.rgba[0] = parseInt(hex.substring(size*0, size*1), 16) / 255;
    this.rgba[1] = parseInt(hex.substring(size*1, size*2), 16) / 255;
    this.rgba[2] = parseInt(hex.substring(size*2, size*3), 16) / 255;
    this.rgba[3] = FSS.Utils.isNumber(opacity) ? opacity : this.rgba[3];*/

    //return FSS.Vector4.create(px[0] / 255, px[1] / 255, px[2] / 255, 1);

    var color = new FSS.Color(rgbToHex(px[0], px[1], px[2]), 1);
    //console.log('color =',color);
    return color ;
  }

  // Return blank rgba
  var color = new FSS.Color(rgbToHex(0, 0, 0), 1);
  //console.log('color =',color);
  return color ;
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
    //console.log('numSamples: ', numSamples);
    //console.log('numSamplesMax: ', numSamplesMax);
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
    //console.log('bestCandidate: ', bestCandidate);
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

function initGif() {
    playGIF(_img, img.preview);
  };

}

(function(){

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
  // Global Properties
  //------------------------------
  var center = FSS.Vector3.create();
  var renderer, scene, mesh, geometry, material;

  //------------------------------
  // Methods
  //------------------------------
  function initialise() {
    createScene();
    createMesh();
    addLights();
    //addControls();
    //LIGHT.randomize();
    animate();
  }

  function createScene() {
    scene = new FSS.Scene();
  }

  function createMesh() {
    scene.remove(mesh);
//    geometry = new FSS.Plane(MESH.width * canvas.width, MESH.height * canvas.height, MESH.slices, img);
    geometry = new FSS.Plane(MESH.width, MESH.height, MESH.slices, img);

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

    light = new FSS.Light(ambient, diffuse);
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

  }

  function animate() {
    update(impulse);
    render();
    requestAnimationFrame(animate);

    impulse -= impulse * 0.5;
    if (impulse < 0) {
      impulse = 0;
    }
  }

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

  function getRandomColor(){
    return '#'+(Math.random().toString(16) + '000000').slice(2, 8);
  }

  //------------------------------
  // Callbacks
  //------------------------------

  // Let there be light!
  initialise();

  // Load gif
  initGif();

})();
