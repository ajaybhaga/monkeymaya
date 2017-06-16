// Load gif.js
var imported = document.createElement('script');
imported.src = 'js/jsfeat-min.js';
document.head.appendChild(imported);

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
    var rescale = 1; // ?

    var threshold = 30;
    jsfeat.fast_corners.set_threshold(threshold);

    var corners = [];
    for(var i = 0; i < img.grayscale.cols*img.grayscale.rows; ++i) {
      corners[i] = new jsfeat.keypoint_t(0,0,0,0);
    }

    var count = Math.min( 500, jsfeat.fast_corners.detect(img.grayscale, corners, 3) );

    for (var i = 0; i < count; i++) {
      createPoint( [corners[i].x*rescale, corners[i].y*rescale], i);
    }

    if (count > 0) {
      console.log('Feature points added.');
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
