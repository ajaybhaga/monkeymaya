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

  var frameCount = 1;
  var frameLimit = 20;
  var frameDivider = 1;
  var lastFrameRenderTime = new Date().getTime();
  var skipFirst = 0; // Skips rendering of first black frame (defect)

  // Field accumulators
  var ax = 0;
  var ay = 0;
  var az = 0;

  // Energy
  var ex = 0;
  var ey = 0;
  var ez = 0;

  // Colours
  var cx = 0;
  var cy = 0;
  var cz = 0;

  var cxLimit = 0.8;
  var cyLimit = 0.7;
  var czLimit = 0.8;

  var zoomIn = true;
  var maxScale = 2.5;

  var impulseLevel = 40;

  var gifData = {
    frames: [],
    widths: [],
    heights: []
  }

  var m4 = {

    /**
     * Takes two 4-by-4 matrices, a and b, and computes the product in the order
     * that pre-composes b with a.  In other words, the matrix returned will
     * transform by b first and then a.  Note this is subtly different from just
     * multiplying the matrices together.  For given a and b, this function returns
     * the same object in both row-major and column-major mode.
     * @param {Matrix4} a A matrix.
     * @param {Matrix4} b A matrix.
     * @param {Matrix4} [dst] optional matrix to store result
     * @return {Matrix4} dst or a new matrix of none provided
     */
    multiply: function(a, b, dst) {
      dst = dst || new Float32Array(16);
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
      dst[ 0] = b00 * a00 + b01 * a10 + b02 * a20 + b03 * a30;
      dst[ 1] = b00 * a01 + b01 * a11 + b02 * a21 + b03 * a31;
      dst[ 2] = b00 * a02 + b01 * a12 + b02 * a22 + b03 * a32;
      dst[ 3] = b00 * a03 + b01 * a13 + b02 * a23 + b03 * a33;
      dst[ 4] = b10 * a00 + b11 * a10 + b12 * a20 + b13 * a30;
      dst[ 5] = b10 * a01 + b11 * a11 + b12 * a21 + b13 * a31;
      dst[ 6] = b10 * a02 + b11 * a12 + b12 * a22 + b13 * a32;
      dst[ 7] = b10 * a03 + b11 * a13 + b12 * a23 + b13 * a33;
      dst[ 8] = b20 * a00 + b21 * a10 + b22 * a20 + b23 * a30;
      dst[ 9] = b20 * a01 + b21 * a11 + b22 * a21 + b23 * a31;
      dst[10] = b20 * a02 + b21 * a12 + b22 * a22 + b23 * a32;
      dst[11] = b20 * a03 + b21 * a13 + b22 * a23 + b23 * a33;
      dst[12] = b30 * a00 + b31 * a10 + b32 * a20 + b33 * a30;
      dst[13] = b30 * a01 + b31 * a11 + b32 * a21 + b33 * a31;
      dst[14] = b30 * a02 + b31 * a12 + b32 * a22 + b33 * a32;
      dst[15] = b30 * a03 + b31 * a13 + b32 * a23 + b33 * a33;
      return dst;
    },


    /**
     * adds 2 vectors3s
     * @param {Vector3} a a
     * @param {Vector3} b b
     * @param {Vector3} dst optional vector3 to store result
     * @return {Vector3} dst or new Vector3 if not provided
     * @memberOf module:webgl-3d-math
     */
    addVectors: function(a, b, dst) {
      dst = dst || new Float32Array(3);
      dst[0] = a[0] + b[0];
      dst[1] = a[1] + b[1];
      dst[2] = a[2] + b[2];
      return dst;
    },

    /**
     * subtracts 2 vectors3s
     * @param {Vector3} a a
     * @param {Vector3} b b
     * @param {Vector3} dst optional vector3 to store result
     * @return {Vector3} dst or new Vector3 if not provided
     * @memberOf module:webgl-3d-math
     */
    subtractVectors: function(a, b, dst) {
      dst = dst || new Float32Array(3);
      dst[0] = a[0] - b[0];
      dst[1] = a[1] - b[1];
      dst[2] = a[2] - b[2];
      return dst;
    },

    /**
     * normalizes a vector.
     * @param {Vector3} v vector to normalzie
     * @param {Vector3} dst optional vector3 to store result
     * @return {Vector3} dst or new Vector3 if not provided
     * @memberOf module:webgl-3d-math
     */
    normalize: function(v, dst) {
      dst = dst || new Float32Array(3);
      var length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
      // make sure we don't divide by 0.
      if (length > 0.00001) {
        dst[0] = v[0] / length;
        dst[1] = v[1] / length;
        dst[2] = v[2] / length;
      }
      return dst;
    },

    /**
     * Computes the cross product of 2 vectors3s
     * @param {Vector3} a a
     * @param {Vector3} b b
     * @param {Vector3} dst optional vector3 to store result
     * @return {Vector3} dst or new Vector3 if not provided
     * @memberOf module:webgl-3d-math
     */
    cross: function(a, b, dst) {
      dst = dst || new Float32Array(3);
      dst[0] = a[1] * b[2] - a[2] * b[1];
      dst[1] = a[2] * b[0] - a[0] * b[2];
      dst[2] = a[0] * b[1] - a[1] * b[0];
      return dst;
    },

    /**
     * Computes the dot product of two vectors; assumes both vectors have
     * three entries.
     * @param {Vector3} a Operand vector.
     * @param {Vector3} b Operand vector.
     * @return {number} dot product
     * @memberOf module:webgl-3d-math
     */
    dot: function(a, b) {
      return (a[0] * b[0]) + (a[1] * b[1]) + (a[2] * b[2]);
    },

    /**
     * Computes the distance squared between 2 points
     * @param {Vector3} a
     * @param {Vector3} b
     * @return {nubmer} distance squared between a and b
     */
    distanceSq: function(a, b) {
      const dx = a[0] - b[0];
      const dy = a[1] - b[1];
      const dz = a[2] - b[2];
      return dx * dx + dy * dy + dz * dz;
    },

    /**
     * Computes the distance between 2 points
     * @param {Vector3} a
     * @param {Vector3} b
     * @return {nubmer} distance between a and b
     */
    distance: function(a, b) {
      return Math.sqrt(distanceSq(a, b));
    },

    /**
     * Makes an identity matrix.
     * @param {Matrix4} [dst] optional matrix to store result
     * @return {Matrix4} dst or a new matrix of none provided
     * @memberOf module:webgl-3d-math
     */
    identity: function(dst) {
      dst = dst || new Float32Array(16);

      dst[ 0] = 1;
      dst[ 1] = 0;
      dst[ 2] = 0;
      dst[ 3] = 0;
      dst[ 4] = 0;
      dst[ 5] = 1;
      dst[ 6] = 0;
      dst[ 7] = 0;
      dst[ 8] = 0;
      dst[ 9] = 0;
      dst[10] = 1;
      dst[11] = 0;
      dst[12] = 0;
      dst[13] = 0;
      dst[14] = 0;
      dst[15] = 1;

      return dst;
    },

    /**
     * Transposes a matrix.
     * @param {Matrix4} m matrix to transpose.
     * @param {Matrix4} [dst] optional matrix to store result
     * @return {Matrix4} dst or a new matrix of none provided
     * @memberOf module:webgl-3d-math
     */
    transpose: function(m, dst) {
      dst = dst || new Float32Array(16);

      dst[ 0] = m[0];
      dst[ 1] = m[4];
      dst[ 2] = m[8];
      dst[ 3] = m[12];
      dst[ 4] = m[1];
      dst[ 5] = m[5];
      dst[ 6] = m[9];
      dst[ 7] = m[13];
      dst[ 8] = m[2];
      dst[ 9] = m[6];
      dst[10] = m[10];
      dst[11] = m[14];
      dst[12] = m[3];
      dst[13] = m[7];
      dst[14] = m[11];
      dst[15] = m[15];

      return dst;
    },

    /**
     * Creates a lookAt matrix.
     * This is a world matrix for a camera. In other words it will transform
     * from the origin to a place and orientation in the world. For a view
     * matrix take the inverse of this.
     * @param {Vector3} cameraPosition position of the camera
     * @param {Vector3} target position of the target
     * @param {Vector3} up direction
     * @param {Matrix4} [dst] optional matrix to store result
     * @return {Matrix4} dst or a new matrix of none provided
     * @memberOf module:webgl-3d-math
     */
    lookAt: function(cameraPosition, target, up, dst) {

      dst = dst || new Float32Array(16);

      var zAxis = this.normalize(this.subtractVectors(cameraPosition, target));
      var xAxis = this.normalize(this.cross(up, zAxis));
      var yAxis = this.normalize(this.cross(zAxis, xAxis));

      dst[ 0] = xAxis[0];
      dst[ 1] = xAxis[1];
      dst[ 2] = xAxis[2];
      dst[ 3] = 0;
      dst[ 4] = yAxis[0];
      dst[ 5] = yAxis[1];
      dst[ 6] = yAxis[2];
      dst[ 7] = 0;
      dst[ 8] = zAxis[0];
      dst[ 9] = zAxis[1];
      dst[10] = zAxis[2];
      dst[11] = 0;
      dst[12] = cameraPosition[0];
      dst[13] = cameraPosition[1];
      dst[14] = cameraPosition[2];
      dst[15] = 1;

      return dst;
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

    /**
     * Computes a 4-by-4 perspective transformation matrix given the angular height
     * of the frustum, the aspect ratio, and the near and far clipping planes.  The
     * arguments define a frustum extending in the negative z direction.  The given
     * angle is the vertical angle of the frustum, and the horizontal angle is
     * determined to produce the given aspect ratio.  The arguments near and far are
     * the distances to the near and far clipping planes.  Note that near and far
     * are not z coordinates, but rather they are distances along the negative
     * z-axis.  The matrix generated sends the viewing frustum to the unit box.
     * We assume a unit box extending from -1 to 1 in the x and y dimensions and
     * from -1 to 1 in the z dimension.
     * @param {number} fieldOfViewInRadians field of view in y axis.
     * @param {number} aspect aspect of viewport (width / height)
     * @param {number} near near Z clipping plane
     * @param {number} far far Z clipping plane
     * @param {Matrix4} [dst] optional matrix to store result
     * @return {Matrix4} dst or a new matrix of none provided
     * @memberOf module:webgl-3d-math
     */
    perspective: function(fieldOfViewInRadians, aspect, near, far, dst) {
      dst = dst || new Float32Array(16);
      var f = Math.tan(Math.PI * 0.5 - 0.5 * fieldOfViewInRadians);
      var rangeInv = 1.0 / (near - far);

      dst[ 0] = f / aspect;
      dst[ 1] = 0;
      dst[ 2] = 0;
      dst[ 3] = 0;
      dst[ 4] = 0;
      dst[ 5] = f;
      dst[ 6] = 0;
      dst[ 7] = 0;
      dst[ 8] = 0;
      dst[ 9] = 0;
      dst[10] = (near + far) * rangeInv;
      dst[11] = -1;
      dst[12] = 0;
      dst[13] = 0;
      dst[14] = near * far * rangeInv * 2;
      dst[15] = 0;

      return dst;
    },

    /**
     * Computes a 4-by-4 orthographic projection matrix given the coordinates of the
     * planes defining the axis-aligned, box-shaped viewing volume.  The matrix
     * generated sends that box to the unit box.  Note that although left and right
     * are x coordinates and bottom and top are y coordinates, near and far
     * are not z coordinates, but rather they are distances along the negative
     * z-axis.  We assume a unit box extending from -1 to 1 in the x and y
     * dimensions and from -1 to 1 in the z dimension.
     * @param {number} left The x coordinate of the left plane of the box.
     * @param {number} right The x coordinate of the right plane of the box.
     * @param {number} bottom The y coordinate of the bottom plane of the box.
     * @param {number} top The y coordinate of the right plane of the box.
     * @param {number} near The negative z coordinate of the near plane of the box.
     * @param {number} far The negative z coordinate of the far plane of the box.
     * @param {Matrix4} [dst] optional matrix to store result
     * @return {Matrix4} dst or a new matrix of none provided
     * @memberOf module:webgl-3d-math
     */
    orthographic: function(left, right, bottom, top, near, far, dst) {
      dst = dst || new Float32Array(16);

      dst[ 0] = 2 / (right - left);
      dst[ 1] = 0;
      dst[ 2] = 0;
      dst[ 3] = 0;
      dst[ 4] = 0;
      dst[ 5] = 2 / (top - bottom);
      dst[ 6] = 0;
      dst[ 7] = 0;
      dst[ 8] = 0;
      dst[ 9] = 0;
      dst[10] = 2 / (near - far);
      dst[11] = 0;
      dst[12] = (left + right) / (left - right);
      dst[13] = (bottom + top) / (bottom - top);
      dst[14] = (near + far) / (near - far);
      dst[15] = 1;

      return dst;
    },

    /**
     * Computes a 4-by-4 perspective transformation matrix given the left, right,
     * top, bottom, near and far clipping planes. The arguments define a frustum
     * extending in the negative z direction. The arguments near and far are the
     * distances to the near and far clipping planes. Note that near and far are not
     * z coordinates, but rather they are distances along the negative z-axis. The
     * matrix generated sends the viewing frustum to the unit box. We assume a unit
     * box extending from -1 to 1 in the x and y dimensions and from -1 to 1 in the z
     * dimension.
     * @param {number} left The x coordinate of the left plane of the box.
     * @param {number} right The x coordinate of the right plane of the box.
     * @param {number} bottom The y coordinate of the bottom plane of the box.
     * @param {number} top The y coordinate of the right plane of the box.
     * @param {number} near The negative z coordinate of the near plane of the box.
     * @param {number} far The negative z coordinate of the far plane of the box.
     * @param {Matrix4} [dst] optional matrix to store result
     * @return {Matrix4} dst or a new matrix of none provided
     * @memberOf module:webgl-3d-math
     */
    frustum: function(left, right, bottom, top, near, far) {
      var dx = right - left;
      var dy = top - bottom;
      var dz = far - near;

      dst[ 0] = 2 * near / dx;
      dst[ 1] = 0;
      dst[ 2] = 0;
      dst[ 3] = 0;
      dst[ 4] = 0;
      dst[ 5] = 2 * near / dy;
      dst[ 6] = 0;
      dst[ 7] = 0;
      dst[ 8] = (left + right) / dx;
      dst[ 9] = (top + bottom) / dy;
      dst[10] = -(far + near) / dz;
      dst[11] = -1;
      dst[12] = 0;
      dst[13] = 0;
      dst[14] = -2 * near * far / dz;
      dst[15] = 0;

      return dst;
    },

    /**
     * Makes a translation matrix
     * @param {number} tx x translation.
     * @param {number} ty y translation.
     * @param {number} tz z translation.
     * @param {Matrix4} [dst] optional matrix to store result
     * @return {Matrix4} dst or a new matrix of none provided
     * @memberOf module:webgl-3d-math
     */
    translation: function(tx, ty, tz, dst) {
      dst = dst || new Float32Array(16);

      dst[ 0] = 1;
      dst[ 1] = 0;
      dst[ 2] = 0;
      dst[ 3] = 0;
      dst[ 4] = 0;
      dst[ 5] = 1;
      dst[ 6] = 0;
      dst[ 7] = 0;
      dst[ 8] = 0;
      dst[ 9] = 0;
      dst[10] = 1;
      dst[11] = 0;
      dst[12] = tx;
      dst[13] = ty;
      dst[14] = tz;
      dst[15] = 1;

      return dst;
    },

    /**
     * Mutliply by translation matrix.
     * @param {Matrix4} m matrix to multiply
     * @param {number} tx x translation.
     * @param {number} ty y translation.
     * @param {number} tz z translation.
     * @param {Matrix4} [dst] optional matrix to store result
     * @return {Matrix4} dst or a new matrix of none provided
     * @memberOf module:webgl-3d-math
     */
    translate: function(m, tx, ty, tz, dst) {
      // This is the optimized version of
      // return multiply(m, translation(tx, ty, tz), dst);
      dst = dst || new Float32Array(16);

      var m00 = m[0];
      var m01 = m[1];
      var m02 = m[2];
      var m03 = m[3];
      var m10 = m[1 * 4 + 0];
      var m11 = m[1 * 4 + 1];
      var m12 = m[1 * 4 + 2];
      var m13 = m[1 * 4 + 3];
      var m20 = m[2 * 4 + 0];
      var m21 = m[2 * 4 + 1];
      var m22 = m[2 * 4 + 2];
      var m23 = m[2 * 4 + 3];
      var m30 = m[3 * 4 + 0];
      var m31 = m[3 * 4 + 1];
      var m32 = m[3 * 4 + 2];
      var m33 = m[3 * 4 + 3];

      if (m !== dst) {
        dst[ 0] = m00;
        dst[ 1] = m01;
        dst[ 2] = m02;
        dst[ 3] = m03;
        dst[ 4] = m10;
        dst[ 5] = m11;
        dst[ 6] = m12;
        dst[ 7] = m13;
        dst[ 8] = m20;
        dst[ 9] = m21;
        dst[10] = m22;
        dst[11] = m23;
      }

      dst[12] = m00 * tx + m10 * ty + m20 * tz + m30;
      dst[13] = m01 * tx + m11 * ty + m21 * tz + m31;
      dst[14] = m02 * tx + m12 * ty + m22 * tz + m32;
      dst[15] = m03 * tx + m13 * ty + m23 * tz + m33;

      return dst;
    },

    /**
     * Makes an x rotation matrix
     * @param {number} angleInRadians amount to rotate
     * @param {Matrix4} [dst] optional matrix to store result
     * @return {Matrix4} dst or a new matrix of none provided
     * @memberOf module:webgl-3d-math
     */
    xRotation: function(angleInRadians, dst) {
      dst = dst || new Float32Array(16);
      var c = Math.cos(angleInRadians);
      var s = Math.sin(angleInRadians);

      dst[ 0] = 1;
      dst[ 1] = 0;
      dst[ 2] = 0;
      dst[ 3] = 0;
      dst[ 4] = 0;
      dst[ 5] = c;
      dst[ 6] = s;
      dst[ 7] = 0;
      dst[ 8] = 0;
      dst[ 9] = -s;
      dst[10] = c;
      dst[11] = 0;
      dst[12] = 0;
      dst[13] = 0;
      dst[14] = 0;
      dst[15] = 1;

      return dst;
    },

    /**
     * Multiply by an x rotation matrix
     * @param {Matrix4} m matrix to multiply
     * @param {number} angleInRadians amount to rotate
     * @param {Matrix4} [dst] optional matrix to store result
     * @return {Matrix4} dst or a new matrix of none provided
     * @memberOf module:webgl-3d-math
     */
    xRotate: function(m, angleInRadians, dst) {
      // this is the optimized version of
      // return multiply(m, xRotation(angleInRadians), dst);
      dst = dst || new Float32Array(16);

      var m10 = m[4];
      var m11 = m[5];
      var m12 = m[6];
      var m13 = m[7];
      var m20 = m[8];
      var m21 = m[9];
      var m22 = m[10];
      var m23 = m[11];
      var c = Math.cos(angleInRadians);
      var s = Math.sin(angleInRadians);

      dst[4]  = c * m10 + s * m20;
      dst[5]  = c * m11 + s * m21;
      dst[6]  = c * m12 + s * m22;
      dst[7]  = c * m13 + s * m23;
      dst[8]  = c * m20 - s * m10;
      dst[9]  = c * m21 - s * m11;
      dst[10] = c * m22 - s * m12;
      dst[11] = c * m23 - s * m13;

      if (m !== dst) {
        dst[ 0] = m[ 0];
        dst[ 1] = m[ 1];
        dst[ 2] = m[ 2];
        dst[ 3] = m[ 3];
        dst[12] = m[12];
        dst[13] = m[13];
        dst[14] = m[14];
        dst[15] = m[15];
      }

      return dst;
    },

    /**
     * Makes an y rotation matrix
     * @param {number} angleInRadians amount to rotate
     * @param {Matrix4} [dst] optional matrix to store result
     * @return {Matrix4} dst or a new matrix of none provided
     * @memberOf module:webgl-3d-math
     */
    yRotation: function(angleInRadians, dst) {
      dst = dst || new Float32Array(16);
      var c = Math.cos(angleInRadians);
      var s = Math.sin(angleInRadians);

      dst[ 0] = c;
      dst[ 1] = 0;
      dst[ 2] = -s;
      dst[ 3] = 0;
      dst[ 4] = 0;
      dst[ 5] = 1;
      dst[ 6] = 0;
      dst[ 7] = 0;
      dst[ 8] = s;
      dst[ 9] = 0;
      dst[10] = c;
      dst[11] = 0;
      dst[12] = 0;
      dst[13] = 0;
      dst[14] = 0;
      dst[15] = 1;

      return dst;
    },

    /**
     * Multiply by an y rotation matrix
     * @param {Matrix4} m matrix to multiply
     * @param {number} angleInRadians amount to rotate
     * @param {Matrix4} [dst] optional matrix to store result
     * @return {Matrix4} dst or a new matrix of none provided
     * @memberOf module:webgl-3d-math
     */
    yRotate: function(m, angleInRadians, dst) {
      // this is the optimized verison of
      // return multiply(m, yRotation(angleInRadians), dst);
      dst = dst || new Float32Array(16);

      var m00 = m[0 * 4 + 0];
      var m01 = m[0 * 4 + 1];
      var m02 = m[0 * 4 + 2];
      var m03 = m[0 * 4 + 3];
      var m20 = m[2 * 4 + 0];
      var m21 = m[2 * 4 + 1];
      var m22 = m[2 * 4 + 2];
      var m23 = m[2 * 4 + 3];
      var c = Math.cos(angleInRadians);
      var s = Math.sin(angleInRadians);

      dst[ 0] = c * m00 - s * m20;
      dst[ 1] = c * m01 - s * m21;
      dst[ 2] = c * m02 - s * m22;
      dst[ 3] = c * m03 - s * m23;
      dst[ 8] = c * m20 + s * m00;
      dst[ 9] = c * m21 + s * m01;
      dst[10] = c * m22 + s * m02;
      dst[11] = c * m23 + s * m03;

      if (m !== dst) {
        dst[ 4] = m[ 4];
        dst[ 5] = m[ 5];
        dst[ 6] = m[ 6];
        dst[ 7] = m[ 7];
        dst[12] = m[12];
        dst[13] = m[13];
        dst[14] = m[14];
        dst[15] = m[15];
      }

      return dst;
    },

    /**
     * Makes an z rotation matrix
     * @param {number} angleInRadians amount to rotate
     * @param {Matrix4} [dst] optional matrix to store result
     * @return {Matrix4} dst or a new matrix of none provided
     * @memberOf module:webgl-3d-math
     */
    zRotation: function(angleInRadians, dst) {
      dst = dst || new Float32Array(16);
      var c = Math.cos(angleInRadians);
      var s = Math.sin(angleInRadians);

      dst[ 0] = c;
      dst[ 1] = s;
      dst[ 2] = 0;
      dst[ 3] = 0;
      dst[ 4] = -s;
      dst[ 5] = c;
      dst[ 6] = 0;
      dst[ 7] = 0;
      dst[ 8] = 0;
      dst[ 9] = 0;
      dst[10] = 1;
      dst[11] = 0;
      dst[12] = 0;
      dst[13] = 0;
      dst[14] = 0;
      dst[15] = 1;

      return dst;
    },

    /**
     * Multiply by an z rotation matrix
     * @param {Matrix4} m matrix to multiply
     * @param {number} angleInRadians amount to rotate
     * @param {Matrix4} [dst] optional matrix to store result
     * @return {Matrix4} dst or a new matrix of none provided
     * @memberOf module:webgl-3d-math
     */
    zRotate: function(m, angleInRadians, dst) {
      // This is the optimized verison of
      // return multiply(m, zRotation(angleInRadians), dst);
      dst = dst || new Float32Array(16);

      var m00 = m[0 * 4 + 0];
      var m01 = m[0 * 4 + 1];
      var m02 = m[0 * 4 + 2];
      var m03 = m[0 * 4 + 3];
      var m10 = m[1 * 4 + 0];
      var m11 = m[1 * 4 + 1];
      var m12 = m[1 * 4 + 2];
      var m13 = m[1 * 4 + 3];
      var c = Math.cos(angleInRadians);
      var s = Math.sin(angleInRadians);

      dst[ 0] = c * m00 + s * m10;
      dst[ 1] = c * m01 + s * m11;
      dst[ 2] = c * m02 + s * m12;
      dst[ 3] = c * m03 + s * m13;
      dst[ 4] = c * m10 - s * m00;
      dst[ 5] = c * m11 - s * m01;
      dst[ 6] = c * m12 - s * m02;
      dst[ 7] = c * m13 - s * m03;

      if (m !== dst) {
        dst[ 8] = m[ 8];
        dst[ 9] = m[ 9];
        dst[10] = m[10];
        dst[11] = m[11];
        dst[12] = m[12];
        dst[13] = m[13];
        dst[14] = m[14];
        dst[15] = m[15];
      }

      return dst;
    },

    /**
     * Makes an rotation matrix around an arbitrary axis
     * @param {Vector3} axis axis to rotate around
     * @param {number} angleInRadians amount to rotate
     * @param {Matrix4} [dst] optional matrix to store result
     * @return {Matrix4} dst or a new matrix of none provided
     * @memberOf module:webgl-3d-math
     */
    axisRotation: function(axis, angleInRadians, dst) {
      dst = dst || new Float32Array(16);

      var x = axis[0];
      var y = axis[1];
      var z = axis[2];
      var n = Math.sqrt(x * x + y * y + z * z);
      x /= n;
      y /= n;
      z /= n;
      var xx = x * x;
      var yy = y * y;
      var zz = z * z;
      var c = Math.cos(angleInRadians);
      var s = Math.sin(angleInRadians);
      var oneMinusCosine = 1 - c;

      dst[ 0] = xx + (1 - xx) * c;
      dst[ 1] = x * y * oneMinusCosine + z * s;
      dst[ 2] = x * z * oneMinusCosine - y * s;
      dst[ 3] = 0;
      dst[ 4] = x * y * oneMinusCosine - z * s;
      dst[ 5] = yy + (1 - yy) * c;
      dst[ 6] = y * z * oneMinusCosine + x * s;
      dst[ 7] = 0;
      dst[ 8] = x * z * oneMinusCosine + y * s;
      dst[ 9] = y * z * oneMinusCosine - x * s;
      dst[10] = zz + (1 - zz) * c;
      dst[11] = 0;
      dst[12] = 0;
      dst[13] = 0;
      dst[14] = 0;
      dst[15] = 1;

      return dst;
    },

    /**
     * Multiply by an axis rotation matrix
     * @param {Matrix4} m matrix to multiply
     * @param {Vector3} axis axis to rotate around
     * @param {number} angleInRadians amount to rotate
     * @param {Matrix4} [dst] optional matrix to store result
     * @return {Matrix4} dst or a new matrix of none provided
     * @memberOf module:webgl-3d-math
     */
    axisRotate: function(m, axis, angleInRadians, dst) {
      // This is the optimized verison of
      // return multiply(m, axisRotation(axis, angleInRadians), dst);
      dst = dst || new Float32Array(16);

      var x = axis[0];
      var y = axis[1];
      var z = axis[2];
      var n = Math.sqrt(x * x + y * y + z * z);
      x /= n;
      y /= n;
      z /= n;
      var xx = x * x;
      var yy = y * y;
      var zz = z * z;
      var c = Math.cos(angleInRadians);
      var s = Math.sin(angleInRadians);
      var oneMinusCosine = 1 - c;

      var r00 = xx + (1 - xx) * c;
      var r01 = x * y * oneMinusCosine + z * s;
      var r02 = x * z * oneMinusCosine - y * s;
      var r10 = x * y * oneMinusCosine - z * s;
      var r11 = yy + (1 - yy) * c;
      var r12 = y * z * oneMinusCosine + x * s;
      var r20 = x * z * oneMinusCosine + y * s;
      var r21 = y * z * oneMinusCosine - x * s;
      var r22 = zz + (1 - zz) * c;

      var m00 = m[0];
      var m01 = m[1];
      var m02 = m[2];
      var m03 = m[3];
      var m10 = m[4];
      var m11 = m[5];
      var m12 = m[6];
      var m13 = m[7];
      var m20 = m[8];
      var m21 = m[9];
      var m22 = m[10];
      var m23 = m[11];

      dst[ 0] = r00 * m00 + r01 * m10 + r02 * m20;
      dst[ 1] = r00 * m01 + r01 * m11 + r02 * m21;
      dst[ 2] = r00 * m02 + r01 * m12 + r02 * m22;
      dst[ 3] = r00 * m03 + r01 * m13 + r02 * m23;
      dst[ 4] = r10 * m00 + r11 * m10 + r12 * m20;
      dst[ 5] = r10 * m01 + r11 * m11 + r12 * m21;
      dst[ 6] = r10 * m02 + r11 * m12 + r12 * m22;
      dst[ 7] = r10 * m03 + r11 * m13 + r12 * m23;
      dst[ 8] = r20 * m00 + r21 * m10 + r22 * m20;
      dst[ 9] = r20 * m01 + r21 * m11 + r22 * m21;
      dst[10] = r20 * m02 + r21 * m12 + r22 * m22;
      dst[11] = r20 * m03 + r21 * m13 + r22 * m23;

      if (m !== dst) {
        dst[12] = m[12];
        dst[13] = m[13];
        dst[14] = m[14];
        dst[15] = m[15];
      }

      return dst;
    },

    /**
     * Makes a scale matrix
     * @param {number} sx x scale.
     * @param {number} sy y scale.
     * @param {number} sz z scale.
     * @param {Matrix4} [dst] optional matrix to store result
     * @return {Matrix4} dst or a new matrix of none provided
     * @memberOf module:webgl-3d-math
     */
    scaling: function(sx, sy, sz, dst) {
      dst = dst || new Float32Array(16);

      dst[ 0] = sx;
      dst[ 1] = 0;
      dst[ 2] = 0;
      dst[ 3] = 0;
      dst[ 4] = 0;
      dst[ 5] = sy;
      dst[ 6] = 0;
      dst[ 7] = 0;
      dst[ 8] = 0;
      dst[ 9] = 0;
      dst[10] = sz;
      dst[11] = 0;
      dst[12] = 0;
      dst[13] = 0;
      dst[14] = 0;
      dst[15] = 1;

      return dst;
    },

    /**
     * Multiply by a scaling matrix
     * @param {Matrix4} m matrix to multiply
     * @param {number} sx x scale.
     * @param {number} sy y scale.
     * @param {number} sz z scale.
     * @param {Matrix4} [dst] optional matrix to store result
     * @return {Matrix4} dst or a new matrix of none provided
     * @memberOf module:webgl-3d-math
     */
    scale: function(m, sx, sy, sz, dst) {
      // This is the optimized verison of
      // return multiply(m, scaling(sx, sy, sz), dst);
      dst = dst || new Float32Array(16);

      dst[ 0] = sx * m[0 * 4 + 0];
      dst[ 1] = sx * m[0 * 4 + 1];
      dst[ 2] = sx * m[0 * 4 + 2];
      dst[ 3] = sx * m[0 * 4 + 3];
      dst[ 4] = sy * m[1 * 4 + 0];
      dst[ 5] = sy * m[1 * 4 + 1];
      dst[ 6] = sy * m[1 * 4 + 2];
      dst[ 7] = sy * m[1 * 4 + 3];
      dst[ 8] = sz * m[2 * 4 + 0];
      dst[ 9] = sz * m[2 * 4 + 1];
      dst[10] = sz * m[2 * 4 + 2];
      dst[11] = sz * m[2 * 4 + 3];

      if (m !== dst) {
        dst[12] = m[12];
        dst[13] = m[13];
        dst[14] = m[14];
        dst[15] = m[15];
      }

      return dst;
    },

    /**
     * Computes the inverse of a matrix.
     * @param {Matrix4} m matrix to compute inverse of
     * @param {Matrix4} [dst] optional matrix to store result
     * @return {Matrix4} dst or a new matrix of none provided
     * @memberOf module:webgl-3d-math
     */
    inverse: function(m, dst) {
      dst = dst || new Float32Array(16);
      var m00 = m[0 * 4 + 0];
      var m01 = m[0 * 4 + 1];
      var m02 = m[0 * 4 + 2];
      var m03 = m[0 * 4 + 3];
      var m10 = m[1 * 4 + 0];
      var m11 = m[1 * 4 + 1];
      var m12 = m[1 * 4 + 2];
      var m13 = m[1 * 4 + 3];
      var m20 = m[2 * 4 + 0];
      var m21 = m[2 * 4 + 1];
      var m22 = m[2 * 4 + 2];
      var m23 = m[2 * 4 + 3];
      var m30 = m[3 * 4 + 0];
      var m31 = m[3 * 4 + 1];
      var m32 = m[3 * 4 + 2];
      var m33 = m[3 * 4 + 3];
      var tmp_0  = m22 * m33;
      var tmp_1  = m32 * m23;
      var tmp_2  = m12 * m33;
      var tmp_3  = m32 * m13;
      var tmp_4  = m12 * m23;
      var tmp_5  = m22 * m13;
      var tmp_6  = m02 * m33;
      var tmp_7  = m32 * m03;
      var tmp_8  = m02 * m23;
      var tmp_9  = m22 * m03;
      var tmp_10 = m02 * m13;
      var tmp_11 = m12 * m03;
      var tmp_12 = m20 * m31;
      var tmp_13 = m30 * m21;
      var tmp_14 = m10 * m31;
      var tmp_15 = m30 * m11;
      var tmp_16 = m10 * m21;
      var tmp_17 = m20 * m11;
      var tmp_18 = m00 * m31;
      var tmp_19 = m30 * m01;
      var tmp_20 = m00 * m21;
      var tmp_21 = m20 * m01;
      var tmp_22 = m00 * m11;
      var tmp_23 = m10 * m01;

      var t0 = (tmp_0 * m11 + tmp_3 * m21 + tmp_4 * m31) -
          (tmp_1 * m11 + tmp_2 * m21 + tmp_5 * m31);
      var t1 = (tmp_1 * m01 + tmp_6 * m21 + tmp_9 * m31) -
          (tmp_0 * m01 + tmp_7 * m21 + tmp_8 * m31);
      var t2 = (tmp_2 * m01 + tmp_7 * m11 + tmp_10 * m31) -
          (tmp_3 * m01 + tmp_6 * m11 + tmp_11 * m31);
      var t3 = (tmp_5 * m01 + tmp_8 * m11 + tmp_11 * m21) -
          (tmp_4 * m01 + tmp_9 * m11 + tmp_10 * m21);

      var d = 1.0 / (m00 * t0 + m10 * t1 + m20 * t2 + m30 * t3);

      dst[0] = d * t0;
      dst[1] = d * t1;
      dst[2] = d * t2;
      dst[3] = d * t3;
      dst[4] = d * ((tmp_1 * m10 + tmp_2 * m20 + tmp_5 * m30) -
            (tmp_0 * m10 + tmp_3 * m20 + tmp_4 * m30));
      dst[5] = d * ((tmp_0 * m00 + tmp_7 * m20 + tmp_8 * m30) -
            (tmp_1 * m00 + tmp_6 * m20 + tmp_9 * m30));
      dst[6] = d * ((tmp_3 * m00 + tmp_6 * m10 + tmp_11 * m30) -
            (tmp_2 * m00 + tmp_7 * m10 + tmp_10 * m30));
      dst[7] = d * ((tmp_4 * m00 + tmp_9 * m10 + tmp_10 * m20) -
            (tmp_5 * m00 + tmp_8 * m10 + tmp_11 * m20));
      dst[8] = d * ((tmp_12 * m13 + tmp_15 * m23 + tmp_16 * m33) -
            (tmp_13 * m13 + tmp_14 * m23 + tmp_17 * m33));
      dst[9] = d * ((tmp_13 * m03 + tmp_18 * m23 + tmp_21 * m33) -
            (tmp_12 * m03 + tmp_19 * m23 + tmp_20 * m33));
      dst[10] = d * ((tmp_14 * m03 + tmp_19 * m13 + tmp_22 * m33) -
            (tmp_15 * m03 + tmp_18 * m13 + tmp_23 * m33));
      dst[11] = d * ((tmp_17 * m03 + tmp_20 * m13 + tmp_23 * m23) -
            (tmp_16 * m03 + tmp_21 * m13 + tmp_22 * m23));
      dst[12] = d * ((tmp_14 * m22 + tmp_17 * m32 + tmp_13 * m12) -
            (tmp_16 * m32 + tmp_12 * m12 + tmp_15 * m22));
      dst[13] = d * ((tmp_20 * m32 + tmp_12 * m02 + tmp_19 * m22) -
            (tmp_18 * m22 + tmp_21 * m32 + tmp_13 * m02));
      dst[14] = d * ((tmp_18 * m12 + tmp_23 * m32 + tmp_15 * m02) -
            (tmp_22 * m32 + tmp_14 * m02 + tmp_19 * m12));
      dst[15] = d * ((tmp_22 * m22 + tmp_16 * m02 + tmp_21 * m12) -
            (tmp_20 * m12 + tmp_23 * m22 + tmp_17 * m02));

      return dst;
    },

    /**
     * Takes a  matrix and a vector with 4 entries, transforms that vector by
     * the matrix, and returns the result as a vector with 4 entries.
     * @param {Matrix4} m The matrix.
     * @param {Vector4} v The point in homogenous coordinates.
     * @param {Vector4} dst optional vector4 to store result
     * @return {Vector4} dst or new Vector4 if not provided
     * @memberOf module:webgl-3d-math
     */
    transformVector: function(m, v, dst) {
      dst = dst || new Float32Array(4);
      for (var i = 0; i < 4; ++i) {
        dst[i] = 0.0;
        for (var j = 0; j < 4; ++j) {
          dst[i] += v[j] * m[j * 4 + i];
        }
      }
      return dst;
    },

    /**
     * Takes a 4-by-4 matrix and a vector with 3 entries,
     * interprets the vector as a point, transforms that point by the matrix, and
     * returns the result as a vector with 3 entries.
     * @param {Matrix4} m The matrix.
     * @param {Vector3} v The point.
     * @param {Vector4} dst optional vector4 to store result
     * @return {Vector4} dst or new Vector4 if not provided
     * @memberOf module:webgl-3d-math
     */
    transformPoint: function(m, v, dst) {
      dst = dst || new Float32Array(3);
      var v0 = v[0];
      var v1 = v[1];
      var v2 = v[2];
      var d = v0 * m[0 * 4 + 3] + v1 * m[1 * 4 + 3] + v2 * m[2 * 4 + 3] + m[3 * 4 + 3];

      dst[0] = (v0 * m[0 * 4 + 0] + v1 * m[1 * 4 + 0] + v2 * m[2 * 4 + 0] + m[3 * 4 + 0]) / d;
      dst[1] = (v0 * m[0 * 4 + 1] + v1 * m[1 * 4 + 1] + v2 * m[2 * 4 + 1] + m[3 * 4 + 1]) / d;
      dst[2] = (v0 * m[0 * 4 + 2] + v1 * m[1 * 4 + 2] + v2 * m[2 * 4 + 2] + m[3 * 4 + 2]) / d;

      return dst;
    },

    /**
     * Takes a 4-by-4 matrix and a vector with 3 entries, interprets the vector as a
     * direction, transforms that direction by the matrix, and returns the result;
     * assumes the transformation of 3-dimensional space represented by the matrix
     * is parallel-preserving, i.e. any combination of rotation, scaling and
     * translation, but not a perspective distortion. Returns a vector with 3
     * entries.
     * @param {Matrix4} m The matrix.
     * @param {Vector3} v The direction.
     * @param {Vector4} dst optional vector4 to store result
     * @return {Vector4} dst or new Vector4 if not provided
     * @memberOf module:webgl-3d-math
     */
    transformDirection: function(m, v, dst) {
      dst = dst || new Float32Array(3);

      var v0 = v[0];
      var v1 = v[1];
      var v2 = v[2];

      dst[0] = v0 * m[0 * 4 + 0] + v1 * m[1 * 4 + 0] + v2 * m[2 * 4 + 0];
      dst[1] = v0 * m[0 * 4 + 1] + v1 * m[1 * 4 + 1] + v2 * m[2 * 4 + 1];
      dst[2] = v0 * m[0 * 4 + 2] + v1 * m[1 * 4 + 2] + v2 * m[2 * 4 + 2];

      return dst;
    },

    /**
     * Takes a 4-by-4 matrix m and a vector v with 3 entries, interprets the vector
     * as a normal to a surface, and computes a vector which is normal upon
     * transforming that surface by the matrix. The effect of this function is the
     * same as transforming v (as a direction) by the inverse-transpose of m.  This
     * function assumes the transformation of 3-dimensional space represented by the
     * matrix is parallel-preserving, i.e. any combination of rotation, scaling and
     * translation, but not a perspective distortion.  Returns a vector with 3
     * entries.
     * @param {Matrix4} m The matrix.
     * @param {Vector3} v The normal.
     * @param {Vector3} [dst] The direction.
     * @return {Vector3} The transformed direction.
     * @memberOf module:webgl-3d-math
     */
    transformNormal: function(m, v, dst) {
      dst = dst || new Float32Array(3);
      var mi = inverse(m);
      var v0 = v[0];
      var v1 = v[1];
      var v2 = v[2];

      dst[0] = v0 * mi[0 * 4 + 0] + v1 * mi[0 * 4 + 1] + v2 * mi[0 * 4 + 2];
      dst[1] = v0 * mi[1 * 4 + 0] + v1 * mi[1 * 4 + 1] + v2 * mi[1 * 4 + 2];
      dst[2] = v0 * mi[2 * 4 + 0] + v1 * mi[2 * 4 + 1] + v2 * mi[2 * 4 + 2];

      return dst;
    },

    copy: function(src, dst) {
      dst = dst || new Float32Array(16);

      dst[ 0] = src[ 0];
      dst[ 1] = src[ 1];
      dst[ 2] = src[ 2];
      dst[ 3] = src[ 3];
      dst[ 4] = src[ 4];
      dst[ 5] = src[ 5];
      dst[ 6] = src[ 6];
      dst[ 7] = src[ 7];
      dst[ 8] = src[ 8];
      dst[ 9] = src[ 9];
      dst[10] = src[10];
      dst[11] = src[11];
      dst[12] = src[12];
      dst[13] = src[13];
      dst[14] = src[14];
      dst[15] = src[15];

      return dst;
    }

  };

  var gl = require('gl')(bufferWidth, bufferHeight, parameters);

  // Log messages will be written to the window's console.
  var Logger = require('js-logger');
  Logger.useDefaults();

  var request = require('request');
  var GIFEncoder = require('gifencoder');
  var Canvas = require('canvas');
  var fs = require('fs');
  var Q = require('q');

  var webglutils = require('./webgl-utils');

  // Create parameters object
  var parameters = {
    preserveDrawingBuffer: false,
    premultipliedAlpha: false,
    antialias: true,
    stencil: true,
    alpha: false
  };


//
  var gifyParse = require('gify-parse');
  var getPixels = require("get-pixels");
  var pixel = require("pixel");


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

  Logger.info('==========================================');
  Logger.info('Monkey Maya Video Processing Engine v' + version);
  Logger.info('==========================================');

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
  var colorLocation;
  // lookup uniforms
  var matrixLocation;

  var translation = [0, 0, 0];
  var rotation = [degToRad(0), degToRad(0), degToRad(0)];
  var scale = [0.2, 0.2, 0.2];


  // functions

  // WebGL text

  // look up where the vertex data needs to go.
  var textMatrixLocation;
  //var textLocation;
  // lookup uniforms
  //var matrixLocation;

  var fontInfo = {
    letterHeight: 8,
    spaceWidth: 8,
    spacing: -1,
    textureWidth: 64,
    textureHeight: 40,
    glyphInfos: {
      'a': { x:  0, y:  0, width: 8, },
      'b': { x:  8, y:  0, width: 8, },
      'c': { x: 16, y:  0, width: 8, },
      'd': { x: 24, y:  0, width: 8, },
      'e': { x: 32, y:  0, width: 8, },
      'f': { x: 40, y:  0, width: 8, },
      'g': { x: 48, y:  0, width: 8, },
      'h': { x: 56, y:  0, width: 8, },
      'i': { x:  0, y:  8, width: 8, },
      'j': { x:  8, y:  8, width: 8, },
      'k': { x: 16, y:  8, width: 8, },
      'l': { x: 24, y:  8, width: 8, },
      'm': { x: 32, y:  8, width: 8, },
      'n': { x: 40, y:  8, width: 8, },
      'o': { x: 48, y:  8, width: 8, },
      'p': { x: 56, y:  8, width: 8, },
      'q': { x:  0, y: 16, width: 8, },
      'r': { x:  8, y: 16, width: 8, },
      's': { x: 16, y: 16, width: 8, },
      't': { x: 24, y: 16, width: 8, },
      'u': { x: 32, y: 16, width: 8, },
      'v': { x: 40, y: 16, width: 8, },
      'w': { x: 48, y: 16, width: 8, },
      'x': { x: 56, y: 16, width: 8, },
      'y': { x:  0, y: 24, width: 8, },
      'z': { x:  8, y: 24, width: 8, },
      '0': { x: 16, y: 24, width: 8, },
      '1': { x: 24, y: 24, width: 8, },
      '2': { x: 32, y: 24, width: 8, },
      '3': { x: 40, y: 24, width: 8, },
      '4': { x: 48, y: 24, width: 8, },
      '5': { x: 56, y: 24, width: 8, },
      '6': { x:  0, y: 32, width: 8, },
      '7': { x:  8, y: 32, width: 8, },
      '8': { x: 16, y: 32, width: 8, },
      '9': { x: 24, y: 32, width: 8, },
      '-': { x: 32, y: 32, width: 8, },
      '*': { x: 40, y: 32, width: 8, },
      '!': { x: 48, y: 32, width: 8, },
      '?': { x: 56, y: 32, width: 8, },
    },
  };


  function makeVerticesForString(fontInfo, s) {
    var len = s.length;
    var numVertices = len * 6;
    var positions = new Float32Array(numVertices * 2);
    var texcoords = new Float32Array(numVertices * 2);
    var offset = 0;
    var x = 0;
    var maxX = fontInfo.textureWidth;
    var maxY = fontInfo.textureHeight;
    for (var ii = 0; ii < len; ++ii) {
      var letter = s[ii];
      var glyphInfo = fontInfo.glyphInfos[letter];
      if (glyphInfo) {
        var x2 = x + glyphInfo.width;
        var u1 = glyphInfo.x / maxX;
        var v1 = (glyphInfo.y + fontInfo.letterHeight - 1) / maxY;
        var u2 = (glyphInfo.x + glyphInfo.width - 1) / maxX;
        var v2 = glyphInfo.y / maxY;

        // 6 vertices per letter
        positions[offset + 0] = x;
        positions[offset + 1] = 0;
        texcoords[offset + 0] = u1;
        texcoords[offset + 1] = v1;

        positions[offset + 2] = x2;
        positions[offset + 3] = 0;
        texcoords[offset + 2] = u2;
        texcoords[offset + 3] = v1;

        positions[offset + 4] = x;
        positions[offset + 5] = fontInfo.letterHeight;
        texcoords[offset + 4] = u1;
        texcoords[offset + 5] = v2;

        positions[offset + 6] = x;
        positions[offset + 7] = fontInfo.letterHeight;
        texcoords[offset + 6] = u1;
        texcoords[offset + 7] = v2;

        positions[offset + 8] = x2;
        positions[offset + 9] = 0;
        texcoords[offset + 8] = u2;
        texcoords[offset + 9] = v1;

        positions[offset + 10] = x2;
        positions[offset + 11] = fontInfo.letterHeight;
        texcoords[offset + 10] = u2;
        texcoords[offset + 11] = v2;

        x += glyphInfo.width + fontInfo.spacing;
        offset += 12;
      } else {
        // we don't have this character so just advance
        x += fontInfo.spaceWidth;
      }
    }

    // return ArrayBufferViews for the portion of the TypedArrays
    // that were actually used.
    return {
      arrays: {
        position: new Float32Array(positions.buffer, 0, offset),
        texcoord: new Float32Array(texcoords.buffer, 0, offset),
      },
      numVertices: offset / 2,
    };
  }

  // Maunally create a bufferInfo
  var textBufferInfo = {
    attribs: {
      a_position: { buffer: gl.createBuffer(), numComponents: 2, },
      a_texcoord: { buffer: gl.createBuffer(), numComponents: 2, },
    },
    numElements: 0,
  };

  var names = [
    "anna",   // 0
    "colin",  // 1
    "james",  // 2
    "danny",  // 3
    "kalin",  // 4
    "hiro",   // 5
    "eddie",  // 6
    "shu",    // 7
    "brian",  // 8
    "tami",   // 9
    "rick",   // 10
    "gene",   // 11
    "natalie",// 12,
    "evan",   // 13,
    "sakura", // 14,
    "kai",    // 15,
  ];

  // Create a texture.
  var glyphTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, glyphTex);
  // Fill the texture with a 1x1 blue pixel.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                new Uint8Array([0, 0, 255, 255]));


    var fUniforms = {
      u_matrix: m4.identity(),
    };

    var textUniforms = {
      u_matrix: m4.identity(),
      u_texture: glyphTex,
      u_color: [0, 0, 0, 1],  // black
    };

    function radToDeg(r) {
      return r * 180 / Math.PI;
    }

    function degToRad(d) {
      return d * Math.PI / 180;
    }

/*
    var translation = [0, 30, 0];
    var rotation = [degToRad(190), degToRad(0), degToRad(0)];
    var scale = [1, 1, 1];
    var fieldOfViewRadians = degToRad(60);
    var rotationSpeed = 1.2;

    var then = 0;
*/

var buildShader = function(type, source) {
  // Create and compile shader
  var shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  // Add error handling
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    return null;
  }

  // Return the shader
  return shader;
};


/**
   * Sets attributes and buffers including the `ELEMENT_ARRAY_BUFFER` if appropriate
   *
   * Example:
   *
   *     var programInfo = createProgramInfo(
   *         gl, ["some-vs", "some-fs");
   *
   *     var arrays = {
   *       position: { numComponents: 3, data: [0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0], },
   *       texcoord: { numComponents: 2, data: [0, 0, 0, 1, 1, 0, 1, 1],                 },
   *     };
   *
   *     var bufferInfo = createBufferInfoFromArrays(gl, arrays);
   *
   *     gl.useProgram(programInfo.program);
   *
   * This will automatically bind the buffers AND set the
   * attributes.
   *
   *     setBuffersAndAttributes(programInfo.attribSetters, bufferInfo);
   *
   * For the example above it is equivilent to
   *
   *     gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
   *     gl.enableVertexAttribArray(a_positionLocation);
   *     gl.vertexAttribPointer(a_positionLocation, 3, gl.FLOAT, false, 0, 0);
   *     gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
   *     gl.enableVertexAttribArray(a_texcoordLocation);
   *     gl.vertexAttribPointer(a_texcoordLocation, 4, gl.FLOAT, false, 0, 0);
   *
   * @param {WebGLRenderingContext} gl A WebGLRenderingContext.
   * @param {Object.<string, function>} setters Attribute setters as returned from `createAttributeSetters`
   * @param {module:webgl-utils.BufferInfo} buffers a BufferInfo as returned from `createBufferInfoFromArrays`.
   * @memberOf module:webgl-utils
   */
  function setBuffersAndAttributes(gl, setters, buffers) {
    setAttributes(setters, buffers.attribs);
    if (buffers.indices) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
    }
  }

var fieldOfViewRadians = degToRad(60);

    // Draw the scene.
    function drawText() {
      Logger.debug('| Draw Text |');

      // Tell WebGL how to convert from clip space to pixels
      gl.viewport(0, 0, bufferWidth, bufferHeight);

      gl.enable(gl.CULL_FACE);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.depthMask(true);

      // Clear the canvas AND the depth buffer.
      //gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // Compute the matrices used for all objects
      var aspect = bufferWidth / bufferHeight;
      var zNear = 1;
      var zFar = 2000;
      var projectionMatrix = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);

      // Compute the camera's matrix using look at.
      var cameraRadius = 360;
      var cameraPosition = [Math.cos(0) * cameraRadius, 0, Math.sin(0) * cameraRadius];
      var target = [0, 0, 0];
      var up = [0, 1, 0];
      Logger.debug('cameraPosition=',cameraPosition);

      var cameraMatrix = m4.lookAt(cameraPosition, target, up);
      Logger.debug('cameraMatrix=',cameraMatrix);

      var viewMatrix = m4.inverse(cameraMatrix);
      Logger.debug('viewMatrix=',viewMatrix);

      var textPositions = [[0, 0, 0]];

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);

      Logger.debug('| Creating Text Program |');

      // Create the program and shaders
      var textProgram = gl.createProgram();

      var textVS = generateTextVertexShader();
      var textFS = generateTextFragmentShader();

      // Create and compile shader
      var textVertexShader = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(textVertexShader, textVS);
      gl.compileShader(textVertexShader);

      // Add error handling
      if (!gl.getShaderParameter(textVertexShader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(textVertexShader));
        return null;
      }

      // Create and compile shader
      var textFragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(textFragmentShader, textFS);
      gl.compileShader(textFragmentShader);

      // Add error handling
      if (!gl.getShaderParameter(textFragmentShader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(textFragmentShader));
        return null;
      }

      Logger.debug('textVertexShader=' + textVertexShader);
      Logger.debug('textFragmentShader=' + textFragmentShader);
      Logger.debug('textProgram=' + textProgram);

      // Attach and link the shader
      gl.attachShader(textProgram, textVertexShader);
      var error = gl.getError();
      var status = gl.getProgramParameter(textProgram, gl.VALIDATE_STATUS);
      Logger.debug('Attach text vertex shader -> VALIDATE_STATUS: '+status+'\nERROR: '+error);

      gl.attachShader(textProgram, textFragmentShader);
      var error = gl.getError();
      var status = gl.getProgramParameter(textProgram, gl.VALIDATE_STATUS);
      Logger.debug('Attach text fragment shader -> VALIDATE_STATUS: '+status+'\nERROR: '+error);

      gl.linkProgram(textProgram);
      var error = gl.getError();
      var status = gl.getProgramParameter(textProgram, gl.VALIDATE_STATUS);
      Logger.debug('Link program -> VALIDATE_STATUS: '+status+'\nERROR: '+error);

      Logger.debug('gl.getProgramInfoLog(textProgram)='+gl.getProgramInfoLog(textProgram));

      // Add error handling
      if (!gl.getProgramParameter(textProgram, gl.LINK_STATUS)) {
        var error = gl.getError();
        var status = gl.getProgramParameter(textProgram, gl.VALIDATE_STATUS);
        console.error('Could not initialise shader.\nVALIDATE_STATUS: '+status+'\nERROR: '+error);
        return null;
      }

      // Delete the shader
      gl.deleteShader(textFragmentShader);
      gl.deleteShader(textVertexShader);

      // draw the text
      // setup to draw the text.
      // Because every letter uses the same attributes and the same progarm
      // we only need to do this once.

      Logger.debug('| Using Text Program |');
      gl.useProgram(textProgram);

      var error = gl.getError();
      var status = gl.getProgramParameter(textProgram, gl.VALIDATE_STATUS);
      Logger.debug('Using text program -> VALIDATE_STATUS: '+status+'\nERROR: '+error);

      // lookup uniforms
      textMatrixLocation = gl.getUniformLocation(textProgram, "u_matrix");

/*
      var positionLocation = gl.getAttribLocation(program, "aPosition");
      var colorLocation = gl.getAttribLocation(program, "aColor");
      // look up where the vertex data needs to go.
      // lookup uniforms
      var matrixLocation = gl.getUniformLocation(program, "uMatrix");
*/

      //webglutils.webglUtils.setBuffersAndAttributes(gl, textProgramInfo, textBufferInfo);

      textPositions.forEach(function(pos, ndx) {

        var name = names[ndx];
        var s = name + ":" + pos[0].toFixed(0) + "," + pos[1].toFixed(0) + "," + pos[2].toFixed(0);
        Logger.debug('| Generating vertices for: ' + s + ' |');

        var vertices = makeVerticesForString(fontInfo, s);
        Logger.debug('vertices=',vertices);

        // update the buffers
        textBufferInfo.attribs.a_position.numComponents = 2;
        gl.bindBuffer(gl.ARRAY_BUFFER, textBufferInfo.attribs.a_position.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices.arrays.position, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, textBufferInfo.attribs.a_texcoord.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices.arrays.texcoord, gl.DYNAMIC_DRAW);

        // use just the position of the 'F' for the text
        // because pos is in view space that means it's a vector from the eye to
        // some position. So translate along that vector back toward the eye some distance
        var fromEye = m4.normalize(pos);
        var amountToMoveTowardEye = 150;  // because the F is 150 units long
        var viewX = pos[0] - fromEye[0] * amountToMoveTowardEye;
        var viewY = pos[1] - fromEye[1] * amountToMoveTowardEye;
        var viewZ = pos[2] - fromEye[2] * amountToMoveTowardEye;
        var desiredTextScale = -1 / bufferHeight * 2;  // 1x1 pixels
        var scale = viewZ * desiredTextScale;

        var textMatrix = m4.translate(projectionMatrix, viewX, viewY, viewZ);
        // scale the F to the size we need it.
        textMatrix = m4.scale(textMatrix, scale, scale, 1);
        Logger.debug('textMatrix=',textMatrix);

        Logger.debug('| Set Text Matrix Uniform |');
        // Set the matrix.
        gl.uniformMatrix4fv(textMatrixLocation, false, textMatrix);

        // set texture uniform
        //m4.copy(textMatrix, textUniforms.u_matrix);
        //webglutils.webglUtils.setUniforms(textProgramInfo, textUniforms);

        // Draw the text.
        gl.drawArrays(gl.TRIANGLES, 0, vertices.numVertices);

        var error = gl.getError();
        var status = gl.getProgramParameter(textProgram, gl.VALIDATE_STATUS);
        Logger.debug('Draw Arrays -> VALIDATE_STATUS: '+status+'\nERROR: '+error);

      });
      Logger.debug('| Text Step 6 |');

      Logger.debug('| End of Draw Text |');
    }

  function generateTextVertexShader() {

    var shader = [

    // Precision
    'precision mediump float;',

    // Attributes
    'attribute vec4 a_position;',
    'attribute vec2 a_texcoord;',
    'attribute vec4 a_color;',

    'uniform mat4 u_matrix;',

    // Varyings
    'varying vec4 v_color;',
    'varying vec2 v_texcoord;',

    // Main
    'void main() {',

        'gl_Position = u_matrix * a_position;',

        // Pass the texcoord to the fragment shader.
        'v_texcoord = a_texcoord;',

        // Pass the color to the fragment shader.
    //    'v_color = vec4(a_color[0],a_color[1],a_color[2],1.0);',
        'v_color = vec4(1.0,1.0,0.0,0.2);',

      // Clamp color
  //    'v_color = clamp(v_color, 0.0, 1.0);',

    '}'

    // Return the shader
    ].join('\n');
    return shader;
  };

  function generateTextFragmentShader() {
    var shader = [

    // Precision
    'precision mediump float;',

    // Varyings
    'varying vec2 v_texcoord;',

    'uniform sampler2D u_texture;',

    // Main
    'void main() {',

      // Set gl_FragColor
      'gl_FragColor = texture2D(u_texture, v_texcoord);',

      //'gl_FragColor = v_color;',
      //'gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);',
      //'gl_FragColor = vec4(gl_FragCoord.x / 640.0, gl_FragCoord.y / 480.0, 0, 1);',

    '}'

    // Return the shader
    ].join('\n');
    return shader;
  };




// Need to enable program
  // Set the program code
//  program.textCode = textCode;

  // setup GLSL programs
  //var fProgramInfo = webglUtils.createProgramInfo(gl, ["3d-vertex-shader", "3d-fragment-shader"]);
  //var textProgramInfo = webglUtils.createProgramInfo(gl, ["text-vertex-shader", "text-fragment-shader"]);

  // text

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

FSS.WebGLRenderer.prototype.render = function(scene, program, wireframe) {
  FSS.Renderer.prototype.render.call(this, scene);
  //Logger.debug('WebGLRenderer render @', getDateTime());

  if (this.unsupported) return;

  positionLocation = gl.getAttribLocation(program, "a_position");
  colorLocation = gl.getAttribLocation(program, "a_color");

  // look up where the vertex data needs to go.
  // lookup uniforms
  matrixLocation = gl.getUniformLocation(program, "u_matrix");


  //Logger.debug('matrixLocation=', matrixLocation);

  // Create a buffer to put colors in
  //colorBuffer = gl.createBuffer();
  // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = colorBuffer)
  //gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  // Put geometry data into buffer
  //setColors(gl);
  Logger.debug('| Draw Scene |');

  // Draw scene
  drawScene(this, wireframe);

  //drawText();

  // Draw text
/*
  var text = new WebGLText(gl);
  Logger.debug('WebGLText=',text);

  text.setText({
              text: 'Hello World!',
              fontFamily: 'sans-serif',
              fontSize: 100
          });

  text.render({
            rotation: 0,
            position: { x: 50, y: 50 },
            center: { x: 100, y: 100 },
            //resolution: this.props.dimensions,
            size: { width: 300, height: 100 }
        });
*/
//var text = "Hello";
//Logger.debug('text=',text);

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

var programBuilt = false;

/**
 * Concepts taken from three.js WebGLRenderer
 * @see https://github.com/mrdoob/three.js/blob/master/src/renderers/WebGLRenderer.js
 */
FSS.WebGLRenderer.prototype.buildProgram = function(lights, wireframe) {

    if (!programBuilt) {

    if (this.unsupported) return;

    // Create shader source
    var vs = FSS.WebGLRenderer.VS(lights);
    var fs = FSS.WebGLRenderer.FS(lights);

    // Derive the shader fingerprint
    var code = vs + fs;

    Logger.debug('Creating program=',code);

    // Check if the program has already been compiled
    //if (!!this.program && this.program.code === code) {
  //  /} else {

      // Create the program and shaders
      var program = this.gl.createProgram();
      var vertexShader = this.buildShader(this.gl.VERTEX_SHADER, vs);
      var fragmentShader = this.buildShader(this.gl.FRAGMENT_SHADER, fs);

      // Create the program and shaders
/*      var textProgram = this.gl.createProgram();
      var textVertexShader = this.buildShader(this.gl.VERTEX_SHADER, textVS);
      var textFragmentShader = this.buildShader(this.gl.FRAGMENT_SHADER, textFS);
*/

      // Attach and link the shader
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
        position: this.buildBuffer(program, 'attribute', 'a_position', 3, 'v3'),
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

      // Move to processFrame for program switching
      // Enable program
      this.gl.useProgram(this.program);

      programBuilt = true;
  }

    var wireframe = false;
    Logger.debug('Starting rendering process.');
    return processFrame(program, wireframe);
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

  // Attributes
  'attribute vec4 a_position;',
  'attribute vec2 a_texcoord;',
  'attribute vec4 a_color;',

  // Uniforms
  'uniform mat4 u_matrix;',

  // Varyings
  'varying vec4 v_color;',
  'varying vec2 v_texcoord;',

  // Main
  'void main() {',

    // Divide x and y by z.
    'gl_Position = u_matrix * a_position;',
    //'gl_Position = u_matrix * a_position;',

    // Pass the color to the fragment shader.
    'v_color = vec4(a_color[0],a_color[1],a_color[2],1.0);',
//    'v_color = vec4(1.0,1.0,0.0,0.2);',

//    'v_color += vec4(aPosition[2]/255.0,aPosition[2]/255.0,aPosition[2]/255.0,1.0);',

    // Clamp color
//    'v_color = clamp(v_color, 0.0, 1.0);',

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
function getTriangleColor(centroidX, centroidY, bBox, frame) {

  //Logger.debug('getTriangleColor -> bBox=',bBox);

  // Use gif color if loaded
  if (gifData.frames.length > 0) {

    ///var sx = Math.floor( img.canvas.width * (box.x + box.width/2) / svg.width );
    //var sy = Math.floor( img.canvas.height * (box.y + box.height/2) / svg.height );
    //var px = img.context.getImageData(sx, sy, 1, 1).data;

    // Cache Variables
    //var offsetX = renderer.width * -0.5;
    //var offsetY = renderer.height * 0.5;

    var x = centroidX; //+ (bBox[1]-bBox[0])/2;
    var y = centroidY;// + (bBox[3]-bBox[2])/2;

    //var sx = img.canvas.width * (x / renderer.width);
  //  Logger.debug('x =',x);
//    Logger.debug('y =',y);
//    Logger.debug('gifData.width =',gifData.width);
//    Logger.debug('gifData.height =',gifData.height);

    //var sy = img.canvas.height * (y / renderer.height);

    //Logger.debug('bBox[0]=',bBox[0],'bBox[1]=',bBox[1],'bBox[1]-bBox[0]=',bBox[1]-bBox[0]);

    var sx = Math.floor(gifData.widths[frame] * (x / (bBox[1]-bBox[0])));
    var sy = Math.floor(gifData.heights[frame] * (y / (bBox[3]-bBox[2])));
  //  Logger.debug('sx =',sx);
  //  Logger.debug('sy =',sy);

//  Logger.debug('x=',x,',y=',y,'sx=',sx,'sy=',sy);


    var iy = gifData.heights[frame]-sy;
//    Logger.debug('gifData.width=',gifData.width,'gifData.height=',gifData.height);
  //  Logger.debug('sx=',sx,'sy=',sy);
//    Logger.debug('sx=',sx,'sy=',sy);
    //var px = img.context.getImageData(sx, iy, 1, 1).data;

//    var r = gifData.frames[0][iy*gifData.width + sx + 0]/255.0;
//    var g = gifData.frames[0][iy*gifData.width + sx + 1]/255.0;
//    var b = gifData.frames[0][iy*gifData.width + sx + 2]/255.0;

//  Logger.debug('gifData.frames',gifData.frames);
//  Logger.debug('gifData.width',gifData.width);
//  Logger.debug('gifData.height',gifData.height);

//for (var j = 0; j < images[i].data.length; j += 3) {
//  fullData[pixelIndex] = 0;//getRandomArbitrary(1,255);//images[i].data[j];
//  fullData[pixelIndex+1] = 255;//images[i].data[j+1];
//  fullData[pixelIndex+2] = 0;//images[i].data[j+2];
//  fullData[pixelIndex+3] = 255;

  var r = sx%255;//gifData.frames[frame][sy*gifData.width + sx + 0];
  var g = sx % 50 + sy % 50;//gifData.frames[frame][sy*gifData.width + sx + 1];
  var b = sx % 50 + sy % 50;//gifData.frames[frame][sy*gifData.width + sx + 2];



    //var color = new FSS.Color('#FFFFFF', 1);
    //Logger.debug('[r,g,b] =',[r,g,b]);
    return [r,g,b];
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
function initialise() {
  Logger.debug('Creating renderer.');
  createRenderer();
  Logger.debug('Creating scene.');
  createScene();
  Logger.debug('Creating mesh.');
  createMesh();
  Logger.debug('Adding lights.');
  addLights();


  loadFont();

  resize(bufferWidth, bufferHeight);
}

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


function loadFont() {
  var fontFile = "https://webglfundamentals.org/webgl/resources/8x8-font.png";
  console.log('| Load Font |');

  return Q.fcall(function () {

    Logger.debug('---------------------------');
    Logger.debug('Creating font texture ');
    Logger.debug('---------------------------');

    var fontTextureWidth;
    var fontTextureHeight;

    return pixel.parse(fontFile).then(function(images) {
      console.log(images.loopCount); // 0(Infinite)
      for (var i = 0; i < images.length; i++) {
        //Logger.debug("Stored frames =", gifData.frames.length);

        fontTextureWidth = images[i].width;
        fontTextureHeight = images[i].height;

        //console.log('gifData.width =',gifData.width);
        //console.log('gifData.height =',gifData.height);
        //console.log('images[i] =',images[i]);

        // Make space for extra alpha channel
        var fullData =  new Uint8Array(fontTextureWidth*fontTextureHeight*4);
        //Logger.debug('fullData length=',fullData.length);

        var pixelIndex = 0;
        // Populate full data set
        for (var j = 0; j < fullData.length; j += 4) {
          fullData[j] = images[i].data[pixelIndex];
          fullData[j+1] = images[i].data[pixelIndex+1];
          fullData[j+2] = images[i].data[pixelIndex+2];
          fullData[j+3] = 255;
          pixelIndex += 3;
        }

        //gifData.frames.push(fullData);

        if (!fullData) {
          Logger.error('** FAILED TO LOAD FONT TEXTURE **');
        } else {
          // Now that the image has loaded make copy it to the texture.
          gl.bindTexture(gl.TEXTURE_2D, glyphTex);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
          //Logger.info('fullData=',fullData);

          //gl.texImage2D(target, level, internalformat, width, height, border, format, type, ArrayBufferView srcData, srcOffset);
//          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[i].data);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fontTextureWidth, fontTextureHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, images[i].data, 0);

          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          progressBar('Storing font texture data (' + fontFile + ')', images.length, i);
          return 0;
        }
      }

      Logger.debug('Loaded font texture data.');

    }).then(function() {

    }).done();
  });
}


function loadGif(inputGifFile, keyword) {
  console.log('keyword =', keyword, ', loadGif =', inputGifFile);

  return Q.fcall(function () {

    Logger.debug('---------------------------');
    Logger.debug('Generating colour palette ');
    Logger.debug('---------------------------');

    return pixel.parse(inputGifFile).then(function(images) {
      console.log(images.loopCount); // 0(Infinite)
      for (var i = 0; i < images.length; i++) {
        //Logger.debug("Stored frames =", gifData.frames.length);

        gifData.widths.push(images[i].width);
        gifData.heights.push(images[i].height);


        //console.log('gifData.width =',gifData.width);
        //console.log('gifData.height =',gifData.height);
        //console.log('images[i] =',images[i]);

        // Make space for extra alpha channel
        var fullData =  new Uint8Array(gifData.widths[i]*gifData.heights[i]*3);
        //Logger.debug('fullData length=',fullData.length);

        var pixelIndex = 0;
        // Populate full data set
        for (var j = 0; j < fullData.length; j += 3) {
          fullData[j] = images[i].data[pixelIndex];
          fullData[j+1] = images[i].data[pixelIndex+1];
          fullData[j+2] = images[i].data[pixelIndex+2];
          pixelIndex += 4;
        }

        gifData.frames.push(fullData);

        progressBar('Storing gif colour data (' + inputGifFile + ')', images.length, i);
      }

      Logger.debug('Loaded gif colour data for',inputGifFile);
      console.log('Colour palette generated.');

    }).then(function() {
        var outputGifFile = "render_" + keyword + ".gif";
        return exportScene(outputGifFile, false).then(function() {

          if (frameCount >= frameLimit) {
            //initExportGif('render' + frameCount + '.gif');
            Logger.debug('Exporting @', getDateTime());
            finishExportGif();
            console.log('Exported file =', outputGifFile);
            return 0;
          }

        });
    }).done();
  });
}


  function exportScene(outputGifFile, wireframe) {
    Logger.debug('Initializing export gif.');
    return initExportGif(outputGifFile).then(function() {
      return renderer.buildProgram(scene.lights.length, wireframe).then(function() {
        Logger.debug('Build and execute program completed.');
        finishExportGif();
        return 0;
      }).done();
    });
    //Logger.debug(program);
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

/**
* Main Frame Loop
*/
function processFrame(program, wireframe) {
  var frame = frameCount;
  var currentTime = new Date().getTime();

  return Q.fcall(function () {

      Logger.debug('[' + frame + '/' + frameLimit + '] Frame render @', getDateTime());

      // Clear context
      renderer.clear();

    })
    .then(update(impulse))
    .then(render(program, wireframe))
    .then(function(result) {

        // First frame renders black (defect: uncertain why)
        if (skipFirst == 0) {
          skipFirst = 1;
        } else {

          //Logger.debug('[' + frame + '] Frame export @', getDateTime());
          // Read pixels from gl buffer
          var pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
          gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);


          Logger.debug('[' + frame + '/' + frameLimit + '] stored frame @', getDateTime());

          //Logger.debug('[' + frame + '] Encoding frame @', getDateTime());
          // Write out the image into memory
          encoder.addFrame(pixels);

        }

        // Apply physics
        impulse -= impulse * 0.5;
        if (impulse < 0) {
          impulse = 0;
        }

        if (ax > 0) {
          ax -= ax * 0.5;
        } else {
          ax += ax * 0.5;
        }

        if (ay > 0) {
          ay -= ay * 0.5;
        } else {
          ay += ay * 0.5;
        }

        if (az > 0) {
          az -= az * 0.5;
        } else {
          az += az * 0.5;
        }

        if (cx > 0) {
          cx -= cx * 0.5;
        }

        if (cy > 0) {
          cy -= cy * 0.5;
        }

        if (cz > 0) {
          cz -= cz * 0.5;
        }


        var delta = currentTime-lastFrameRenderTime;
        var deltaTime = dhm(delta);
        Logger.debug('[' + frame + '/' + frameLimit + '] Total frame render time:', deltaTime);


        // Store render time for next frame
        lastFrameRenderTime = currentTime;

        if (progressBar('Rendering frames', frameLimit, frameCount) > 0) {
          frameCount++;
          // Continue loop to next frame
          return processFrame(program, wireframe);
        }
      });

}

function finishExportGif() {
  encoder.finish();
  Logger.debug('--------------------');
  Logger.debug('Encoding completed.');
  Logger.debug('--------------------');

  // Clear frame data
  gifData.frames = [];
  gifData.widths = [];
  gifData.heights = [];
  frameCount = 1;

  //

  // expecting something close to 500
  setTimeout(function(){ process.exit(); }, 2000);

}

function initExportGif(filename) {
  return Q.fcall(function () {

    Logger.debug('--------------------');
    Logger.debug('Init export gif');
    Logger.debug('--------------------');


    Logger.debug('');
    Logger.debug('| Encoding Parameters: |');
    Logger.debug('');

    // stream the results as they are available into myanimated.gif
    encoder.createReadStream().pipe(fs.createWriteStream(filename));

    encoder.start();
    encoder.setRepeat(0);  // 0 for repeat, -1 for no-repeat
    encoder.setDelay(250);  // frame delay in ms
    encoder.setQuality(10); // image quality. 10 is default.

    Logger.debug('GL drawing buffer width = ' + gl.drawingBufferWidth);
    Logger.debug('GL drawing buffer height = ' + gl.drawingBufferHeight);

    Logger.debug('gifData.frames.length=' + gifData.frames.length);
    Logger.debug('gifData.widths.length=' + gifData.widths.length);
    Logger.debug('gifData.heights.length=' + gifData.heights.length);

    Logger.debug('frameCount=' + frameCount);
    Logger.debug('frameLimit=' + frameLimit);
    Logger.debug('frameDivider=' + frameDivider);

    Logger.debug('lastFrameRenderTime=' + lastFrameRenderTime);
    Logger.debug('skipFirst=' + skipFirst);

  });
}

/**
 * Request Animation Frame Polyfill.
 * @author Paul Irish
 * @see https://gist.github.com/paulirish/1579671
 */

var lastTime = 0;

var requestAnimationFrame = function(callback) {
  return Q.fcall(function () {

    if (callback) {
      Logger.debug('Submitted next frame for rendering.');
      var currentTime = new Date().getTime();
      var timeToCall = Math.max(0, 16 - (currentTime - lastTime));
      var id = setTimeout(function() { callback(currentTime + timeToCall); }, timeToCall);
      lastTime = currentTime + timeToCall;
      //return id;
    }

  });
};

var cancelAnimationFrame = function(id) {
  clearTimeout(id);
};

function update(vibFactor) {
  return Q.fcall(function () {

    Logger.debug('| Updating |');

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

    //Logger.debug('update();');
  });
}

function render(program, wireframe) {
  return Q.fcall(function () {
    //Logger.debug('render();');
    Logger.debug('| Rendering |');

    return renderer.render(scene, program, wireframe);
  });
}

function getRandomColor(){
  return '#'+(Math.random().toString(16) + '000000').slice(2, 8);
}

function radToDeg(r) {
  return r * 180 / Math.PI;
}

function degToRad(d) {
  return d * Math.PI / 180;
}

function fillBuffers() {


}

var positionBuffer;
var colorBuffer;
var frame = 0;


  // Draw the scene.
  function drawScene(renderer, wireframe) {

    var m, mesh, t, tl, triangle, l, light,
        attribute, uniform, buffer, data, location,
        update = false, lights = scene.lights.length,
        index, v,vl,vetex,vertexCount = 0;


    //Logger.debug('drawScene()');

    // Clear the canvas AND the depth buffer.
    //gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Turn on culling. By default backfacing triangles
    // will be culled.
    gl.enable(gl.CULL_FACE);

    // Enable the depth buffer
    gl.enable(gl.DEPTH_TEST);

    // Compute the matrices
    var matrix = m4.projection(bufferWidth, bufferHeight, 400);

    //Logger.debug('start draw scene gl errors=',gl.getError());

    // Create a buffer to put positions in
    positionBuffer = gl.createBuffer();
    // Create a buffer to put colors in
    colorBuffer = gl.createBuffer();

    // Put geometry data into buffer
    //setGeometry(gl);
    var numVertices = initVertexField(gl, positionBuffer, colorBuffer, frame);
    frame++;
    if (frame > gifData.frames.length) {
      Logger.debug('Frames exceeded, reset.');
      frame = 0;
    }

    // Turn on the position attribute
    //gl.enableVertexAttribArray(program.attributes.position.buffer);
    gl.enableVertexAttribArray(positionLocation);

    // Turn on the color attribute
    gl.enableVertexAttribArray(colorLocation);
    //gl.enableVertexAttribArray(program.attributes.position.buffer);

    // Bind the position buffer.
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    //Logger.debug('bindBuffer gl errors=',gl.getError());

    // Tell the position attribute how to get data out of positionBuffer (ARRAY_BUFFER)
    var size = 3;          // 3 components per iteration
    var type = gl.FLOAT;   // the data is 32bit floats
    var normalize = false; // don't normalize the data
    var stride = 3*4;        // 0 = move forward size * sizeof(type) each iteration to get the next position
    var offset = 0;        // start at the beginning of the buffer
    gl.vertexAttribPointer(positionLocation, size, type, normalize, stride, offset);
    //Logger.debug('vertexAttribPointer gl errors=',gl.getError());

    // Bind the color buffer.
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    //Logger.debug('bindBuffer gl errors=',gl.getError());
    // Tell the attribute how to get data out of colorBuffer (ARRAY_BUFFER)
    var size = 3;                 // 3 components per iteration
    var type = gl.UNSIGNED_BYTE;          // the data is unsigned byte
    var normalize = true;         // normalize the data (convert from 0-255 to 0-1)
    var stride = 0;               // 0 = move forward size * sizeof(type) each iteration to get the next position
    var offset = 0;               // start at the beginning of the buffer
    gl.vertexAttribPointer(
        colorLocation, size, type, normalize, stride, offset)
    //Logger.debug('vertexAttribPointer gl errors=',gl.getError());

//    glvertexAttribPointer(attribute, 4, gl.UNSIGNED_BYTE, false, 32, 12);




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
  if (wireframe) {
    gl.drawArrays(gl.LINE_STRIP, 0, numVertices);
  } else {
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, numVertices);

  }

    //   	gl.drawArrays(gl.TRIANGLES, 0, 16*6);
/*
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
            //    renderer.setBufferData(index, buffer, vertex.position);
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

/*
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
  }*/

  rotation[0] += degToRad(0);
  rotation[1] += degToRad(0);
  rotation[2] += degToRad(0);
  translation[0] += 0.0;
  translation[0] += 0.0;
  translation[2] += 0.0;


/*
  if (zoomIn) {
    scale[0] *= 1.03;
    scale[1] *= 1.03;
    scale[2] *= 1.03;
  } else {
    scale[0] *= 0.97;
    scale[1] *= 0.97;
    scale[2] *= 0.97;
  }*/

  if (scale[0] > maxScale) {
    zoomIn = false;
  }

  if (scale[0] < 0.4) {
    zoomIn = true;
  }

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

  //Logger.debug('matrix=', matrix);

  // Update frame limit
  //frameLimit = Math.round(gifData.frames.length / frameDivider);
  Logger.debug('Total gifData.frames=', gifData.frames.length);

  //Logger.debug('gl errors=',gl.getError());


  // Draw the geometry.
  var primitiveType = gl.TRIANGLES;
  var offset = 0;
  var count = vertexCount;//16 * 6;
  gl.drawArrays(primitiveType, offset, count);
  //Logger.debug('WebGLRenderer # of vertices @', vertexCount);
  //Logger.debug('WebGLRenderer draw arrays @', getDateTime());
  //Logger.debug('gl errors=',gl.getError());


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
}

function initVertexField(gl, positionBuffer, colorBuffer, frame) {
  var perspective=0;
  var gheight;
  var totverticesTS=0;

  var xMin, xMax, yMin, yMax;
  xMin = Number.POSITIVE_INFINITY;
  xMax = Number.NEGATIVE_INFINITY;
  yMin = Number.POSITIVE_INFINITY;
  yMax = Number.NEGATIVE_INFINITY;


  var cols=45, rows=45;
  var gx,  gy;

  var triangleStripArray = new Array();

  var vertixx =  new Float32Array(rows*cols);
  var vertixy = new Float32Array(rows*cols);
  var vertixz = new Float32Array(rows*cols);

  gx=128;
  gy=128;
	gheight=25;

	var i=0, j=0;
	var index=0;
	var totverticesRC=2*cols*(rows-1) ;
	var totverticesTS=2*cols*(rows-1)+2*(rows-2) ;
  var numVertices=totverticesTS;

	var verticesArray =new Float32Array(3*totverticesTS);//42);
  //var verticeColorArray =new Float32Array(3*totverticesTS);
  var verticeColorArray = new Uint8Array(3*totverticesTS);


  ex += getRandomArbitrary(0, impulseLevel);
  ey += getRandomArbitrary(0, impulseLevel);
  ez += getRandomArbitrary(10, 20);

  ax += getRandomArbitrary(0, ex);
  ay += getRandomArbitrary(0, ey);
  az += getRandomArbitrary(0, ez);

  cx += 1/(1+getRandomArbitrary(1, 15));
  cy += 1/(1+getRandomArbitrary(1, 25));
  cz += 1/(1+getRandomArbitrary(1, 25));

  if (cx > cxLimit) {
    cx = cxLimit;
  }
  if (cy > cyLimit) {
    cy = cyLimit;
  }
  if (cz > czLimit) {
    cz = czLimit;
  }

  if (az > 155) {
    az = 155;
  }

  //Logger.debug('cx=',cx,'cy=',cy,'cz=',cz);

  if (getRandomArbitrary(0, 1) == 1) {
    ax *= -1;
  }
  if (getRandomArbitrary(0, 1) == 1) {
    ay *= -1;
  }
  if (getRandomArbitrary(0, 1) == 1) {
    az *= -1;
  }

	for (var row =0; row<rows; row++) {
	   for (var col=0; col<cols; col++) {

      vertixx[j]=(gx*col) + getRandomArbitrary(0, impulseLevel)*1.4;
			vertixy[j]=(gy*row) + getRandomArbitrary(0, impulseLevel)*1.4;
      vertixz[j] = 100+az;

      if (vertixx[j] < xMin) {
        xMin = vertixx[j];
      }

      if (vertixx[j] > xMax) {
        xMax = vertixx[j];
      }

      if (vertixy[j] < yMin) {
        yMin = vertixy[j];
      }

      if (vertixy[j] > yMax) {
        yMax = vertixy[j];
      }

      j++;
    }
  }

  var vertexFieldBBox = [xMin, xMax, yMin, yMax];

/*
  for (var row = 0; row < rows; row += 1) {
	   for (var col= 0; col < cols; col += 1) {

       j = row*cols + col;

       var r = 0;
       var g = 0;
       var b = 0;

       var px = vertixx[j];
       var py = vertixy[j];

//       getTriangleColor()
       var rgb = getTriangleColor(px, py, vertexFieldBBox, frame);
  //     var rgb = [1.0, 0.0, 1.0];

       r = rgb[0];
       g = rgb[1];
       b = rgb[2];

      }
	}
*/
//  var vertixr = vertixr.scaleBetween(1, 255);
//  var vertixg = vertixg.scaleBetween(1, 255);
//  var vertixb = vertixb.scaleBetween(1, 255);


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

	var k=0,m=0,n=0;
	var j=0;
  var  y = 0;
	for(i=0;i<triangleStripArray.length; i++)
	{
		index=triangleStripArray[j];
		j++;

		verticesArray[k++]=vertixx[index-1];
		verticesArray[k++]=vertixy[index-1];
		verticesArray[k++]=vertixz[index-1];


    var px = vertixx[index-1];// + (vertexFieldBBox[1]-vertexFieldBBox[0])/2;
    var py = vertixy[index-1];// + (vertexFieldBBox[3]-vertexFieldBBox[2])/2;

    //       getTriangleColor()
    //getTriangleColor(px, py, vertexFieldBBox, frame);
    //rgb = [255,0,100];
    var sx = Math.floor(gifData.widths[frame] * (px / (vertexFieldBBox[1]-vertexFieldBBox[0])));
    var sy = Math.floor(gifData.heights[frame] * (py / (vertexFieldBBox[3]-vertexFieldBBox[2])));
    //var rgb = [sx*8 % 255,0.0,sy*8 % 255];

    var iy = gifData.heights[frame]-sy;

    //Logger.debug('sx=',sx,'sy=',sy);

    var rgb = [
      // Red
      (gifData.frames[frame][(iy-1)*(gifData.widths[frame]*3) + ((sx-1)*3) + 0]
      + gifData.frames[frame][(iy-1)*(gifData.widths[frame]*3) + (sx*3) + 0]
      + gifData.frames[frame][(iy-1)*(gifData.widths[frame]*3) + ((sx+1)*3) + 0]
      + gifData.frames[frame][iy*(gifData.widths[frame]*3) + ((sx+1)*3) + 0]
      + gifData.frames[frame][(iy+1)*(gifData.widths[frame]*3) + ((sx+1)*3) + 0]
      + gifData.frames[frame][(iy+1)*(gifData.widths[frame]*3) + (sx*3) + 0]
      + gifData.frames[frame][(iy+1)*(gifData.widths[frame]*3) + ((sx-1)*3) + 0]
      + gifData.frames[frame][iy*(gifData.widths[frame]*3) + ((sx-1)*3) + 0])/8,

      // Green
      (gifData.frames[frame][(iy-1)*(gifData.widths[frame]*3) + ((sx-1)*3) + 1]
      + gifData.frames[frame][(iy-1)*(gifData.widths[frame]*3) + (sx*3) + 1]
      + gifData.frames[frame][(iy-1)*(gifData.widths[frame]*3) + ((sx+1)*3) + 1]
      + gifData.frames[frame][iy*(gifData.widths[frame]*3) + ((sx+1)*3) + 1]
      + gifData.frames[frame][(iy+1)*(gifData.widths[frame]*3) + ((sx+1)*3) + 1]
      + gifData.frames[frame][(iy+1)*(gifData.widths[frame]*3) + (sx*3) + 1]
      + gifData.frames[frame][(iy+1)*(gifData.widths[frame]*3) + ((sx-1)*3) + 1]
      + gifData.frames[frame][iy*(gifData.widths[frame]*3) + ((sx-1)*3) + 1])/8,

      // Blue
      (gifData.frames[frame][(iy-1)*(gifData.widths[frame]*3) + ((sx-1)*3) + 2]
      + gifData.frames[frame][(iy-1)*(gifData.widths[frame]*3) + (sx*3) + 2]
      + gifData.frames[frame][(iy-1)*(gifData.widths[frame]*3) + ((sx+1)*3) + 2]
      + gifData.frames[frame][iy*(gifData.widths[frame]*3) + ((sx+1)*3) + 2]
      + gifData.frames[frame][(iy+1)*(gifData.widths[frame]*3) + ((sx+1)*3) + 2]
      + gifData.frames[frame][(iy+1)*(gifData.widths[frame]*3) + (sx*3) + 2]
      + gifData.frames[frame][(iy+1)*(gifData.widths[frame]*3) + ((sx-1)*3) + 2]
      + gifData.frames[frame][iy*(gifData.widths[frame]*3) + ((sx-1)*3) + 2])/8
  ];


    //var rgb = [gifData.frames[frame][iy*(gifData.width*3) + (sx*3) + 0],gifData.frames[frame][iy*(gifData.width*3) + (sx*3) + 1],gifData.frames[frame][iy*(gifData.width*3) + (sx*3) + 2]];
//var rgb = [255,0,255];

    //    var r = gifData.frames[0][iy*gifData.width + sx + 0]/255.0;
    //    var g = gifData.frames[0][iy*gifData.width + sx + 1]/255.0;
    //    var b = gifData.frames[0][iy*gifData.width + sx + 2]/255.0;


    verticeColorArray[y++]=rgb[0];//getRandomArbitrary(0, 255);//vertixr[index-1];//0.1+((getRandomArbitrary(0, 255)/255.0)*cx);
    verticeColorArray[y++]=rgb[1];//vertixg[index-1];//0.1+((getRandomArbitrary(0, 255)/255.0)*cy);
    verticeColorArray[y++]=rgb[2];//vertixb[index-1];//0.1+((getRandomArbitrary(0, 255)/255.0)*cz);


//    if ((i % 2) == 0) {
  //    verticeColorArray[m++]=255;
  //		verticeColorArray[m++]=0;
  //		verticeColorArray[m++]=10+getRandomArbitrary(0, 245);
//    } else {

      //verticeColorArray[m++]=0.2;//vertixa[index-1];
      //verticeColorArray[m++]=0.2;
  		//verticeColorArray[m++]=i;
  //  }
    //verticeColorArray[m++]=0;

    //verticeColorArray[m++]=vertixz[index-1];


  }




	//gl.bindBuffer(gl.ARRAY_BUFFER, verticeBufferObject);
	//gl.bufferData(gl.ARRAY_BUFFER, verticesArray, gl.STATIC_DRAW);

  // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, verticesArray, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, verticeColorArray, gl.STATIC_DRAW);

//  Logger.debug('Generated color field, verticeColorArray=',verticeColorArray);

  // Build color field based on vertices and load buffer data
//  initColorField(gl, rows, cols, triangleStripArray, vertixx, vertixy, vertixz, verticesArray);


  //var zh = vertixz.scaleBetween(10, 250);
  //Logger.debug('zh=',zh);
/*
  var k=0,n=0;
  j=0;
  for(i=0;i<triangleStripArray.length; i++)
  {
    index=triangleStripArray[j];
    j++;

    // Vertex
    verticeColorArray[k++]=0;//zh[index-1];
    verticeColorArray[k++]=255;//zh[index-1];
    verticeColorArray[k++]=0;//zh[index-1];


    //verticeColorArray[k++]=0;//zh[index-1];
  }
*/



//  return verticesArray;

//	gl.bindBuffer(gl.ARRAY_BUFFER, verticeColorBufferObject);
//	gl.bufferData(gl.ARRAY_BUFFER, verticeColorArray, gl.STATIC_DRAW);

  return numVertices;
}


function scaleBetween(unscaledNum, minAllowed, maxAllowed, min, max) {
  return (maxAllowed - minAllowed) * (unscaledNum - min) / (max - min) + minAllowed;
}


Float32Array.prototype.scaleBetween = function(scaledMin, scaledMax) {
  var max = Math.max.apply(Math, this);
  var min = Math.min.apply(Math, this);
  return this.map(num => (scaledMax-scaledMin)*(num-min)/(max-min)+scaledMin);
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

function loadLib() {
  initialise();
}

exports.loadLib = loadLib;
exports.loadGif = loadGif;
exports.exportScene = exportScene;


})();
