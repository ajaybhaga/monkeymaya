React webgl canvas component
---------------
A React webgl canvas component that handles resizing and context loss.

Installation
============
Use [npm](https://www.npmjs.com/) to install:
```bash
npm install webgl-canvas
```

Usage
============

```js
import React, { Component } from 'react';
import WebGLCanvas from 'webgl-canvas';

export default class Canvas extends Component {

    onSceneInitialized(gl) {
        // handle any initialization here. This function is called the first time
        // the component mounts. It will be called again if the webgl context is
        // lost and needs to be reinitialized (this is handled automatically by
        // the WebGLCanvas component)
    }

    onSceneRender(gl) {
        // render your scene! This function is called at 60fps by requestAmimationFrame
    }

    render() {
        return (
            <WebGLCanvas dimensions={{ width: 500, height: 300 }}
                         onSceneInitialized={gl => this.onSceneInitialized(gl)}
                         onSceneRender={gl => this.onSceneRender(gl)} />
        );
    }
}
```

Copyright and License
============
Code and documentation copyright 2017 Jon Brennecke. Code released under the MIT license. Docs released under Creative Commons.
