// Load gif.js
var imported = document.createElement('script');
imported.src = 'js/gif.js';
document.head.appendChild(imported);

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

var img = {
  preview: document.querySelector("#preview"),
  canvas: document.createElement("canvas"),
  context: null,
  grayscale: null,
  loaded: false
}

document.querySelector("#gifcanvas").appendChild( img.canvas );
img.context = img.canvas.getContext("2d");

var playGIF = function(gif, preview) {

  console.log('Playing gif: ', gif.getAttribute("src"));

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

  // Load image frame
  //img.preview.src = "images/mao.jpg";
  var _img = document.createElement('img');
  //      document.getElementById('download').appendChild(_img);
  _img.style.visibility = 'hidden';

  var files = [];

  files.push('dancingmonkey.gif');
  files.push('dancingmonkey2.gif');
  files.push('patterns.gif');
  files.push('cheetah.gif');

  var wordList = [];
  wordList.push('fun');
  wordList.push('happy');
  wordList.push('dark');
  wordList.push('unhappy');
  wordList.push('sad');
  wordList.push('angry');
  wordList.push('worried');
  wordList.push('paranoid');
  wordList.push('compassion');
  wordList.push('excited');
  wordList.push('elated');
  wordList.push('crazy');
  wordList.push('love');
  wordList.push('hate');

  var r = Math.floor(Math.random() * wordList.length);
  mood = wordList[r]; // search query

  console.log('mood: ', mood);

  var q = mood; // search query
  var request = new XMLHttpRequest;
  request.open('GET', 'http://api.giphy.com/v1/gifs/random?api_key=dc6zaTOxFJmzC&tag='+q, true);

  request.onload = function() {

    console.log('Retrieving gif from giphy.');
    if (request.status >= 200 && request.status < 400) {
        data = JSON.parse(request.responseText).data.image_url;
        //console.log(data);
        //console.log(JSON.parse(request.responseText).data);
        //document.getElementById("giphyme").innerHTML = '<center><img src = "'+data+'"  title="GIF via Giphy"></center>';

        if (_img != null) {
          _img.src = data;
          playGIF(_img, img.preview);
        }

    } else {
      console.log('reached giphy, but API returned an error');
    }

  };

  request.onerror = function() {
    console.log('connection error');
  };

  request.send();

  var r = Math.floor(Math.random() * files.length);
  console.log(r);

  //_img.src = 'images/' + files[r];
  //setTimeout(function() { playGIF(_img); }, 0);
  //playGIF.doPlay();
}
