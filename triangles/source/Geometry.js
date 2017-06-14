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
      var t,triangle;
      for (t = this.triangles.length - 1; t >= 0; t--) {
        triangle = this.triangles[t];
        triangle.computeCentroid();
        triangle.computeNormal();
      }
      this.dirty = false;
    }
    return this;
  },
  shake: function() {
    var dx, dy;
    var damt = 0.4;

    for (var i = this.vertices.length; i--; ) {
      dx =  Math.random()*damt;
      dy =  -Math.random()*damt;

      var vertex = this.vertices[i];
      this.vertices[i] = [vertex[0] + dx, vertex[1] + dy];
      console.log(this.vertices[i]);
    }

  }
};
