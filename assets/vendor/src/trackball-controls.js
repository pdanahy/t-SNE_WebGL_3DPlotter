( function () {

  const _changeEvent = {
    type: 'change'
  };
  const _startEvent = {
    type: 'start'
  };
  const _endEvent = {
    type: 'end'
  };

  class TrackballControls extends THREE.EventDispatcher {

    constructor( object, domElement ) {

      super();
      if ( domElement === undefined ) console.warn( 'THREE.TrackballControls: The second parameter "domElement" is now mandatory.' );
      if ( domElement === document ) console.error( 'THREE.TrackballControls: "document" should not be used as the target "domElement". Please use "renderer.domElement" instead.' );
      const scope = this;

      const STATE = {
        NONE: - 1,
        ROTATE: 0,
        ZOOM: 1,
        PAN: 2,
        TOUCH_ROTATE: 3,
        TOUCH_ZOOM_PAN: 4
      };
      this.object = object;
      this.domElement = domElement;
      this.domElement.style.touchAction = 'none'; // disable touch scroll
      // API

      this.enabled = true;
      this.screen = {
        left: 0,
        top: 0,
        width: 0,
        height: 0
      };
      this.rotateSpeed = 1.0;
      this.zoomSpeed = 1.2;
      this.panSpeed = 0.3;
      this.noRotate = false;
      this.noZoom = false;
      this.noPan = false;
      this.staticMoving = false;
      this.dynamicDampingFactor = 0.2;
      this.minDistance = 0;
      this.maxDistance = Infinity;
      this.keys = [ 'KeyA',
        /*A*/
        'KeyS',
        /*S*/
        'KeyD'
        /*D*/
      ];
      this.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
      }; // internals

      this.mousePosition = new THREE.Vector2();
      this.target = new THREE.Vector3();
      const EPS = 0.000001;
      const lastPosition = new THREE.Vector3();
      let lastZoom = 1;
      let _state = STATE.NONE,
        _keyState = STATE.NONE,
        _touchZoomDistanceStart = 0,
        _touchZoomDistanceEnd = 0,
        _lastAngle = 0;

      const _eye = new THREE.Vector3(),
        _movePrev = new THREE.Vector2(),
        _moveCurr = new THREE.Vector2(),
        _lastAxis = new THREE.Vector3(),
        _zoomStart = new THREE.Vector2(),
        _zoomEnd = new THREE.Vector2(),
        _panStart = new THREE.Vector2(),
        _panEnd = new THREE.Vector2(),
        _pointers = [],
        _pointerPositions = {}; // for reset


      this.target0 = this.target.clone();
      this.position0 = this.object.position.clone();
      this.up0 = this.object.up.clone();
      this.zoom0 = this.object.zoom; // methods

      this.handleResize = function () {

        const box = scope.domElement.getBoundingClientRect(); // adjustments come from similar code in the jquery offset() function

        const d = scope.domElement.ownerDocument.documentElement;
        scope.screen.left = box.left + window.pageXOffset - d.clientLeft;
        scope.screen.top = box.top + window.pageYOffset - d.clientTop;
        scope.screen.width = box.width;
        scope.screen.height = box.height;

      };

      // returns {x: y: } where x and y are screen coords scaled 0:1 with origin in upper left
      const getMouseOnScreen = function () {

        const vector = new THREE.Vector2();
        return function getMouseOnScreen( pageX, pageY ) {

          vector.set( ( pageX - scope.screen.left ) / scope.screen.width, ( pageY - scope.screen.top ) / scope.screen.height );
          return vector;

        };

      }();

      const getMouseOnCircle = function () {

        const vector = new THREE.Vector2();
        return function getMouseOnCircle( pageX, pageY ) {

          vector.set( ( pageX - scope.screen.width * 0.5 - scope.screen.left ) / ( scope.screen.width * 0.5 ), ( scope.screen.height + 2 * ( scope.screen.top - pageY ) ) / scope.screen.width );
          return vector;

        };

      }();

      this.rotateCamera = function () {

        const axis = new THREE.Vector3(),
          quaternion = new THREE.Quaternion(),
          eyeDirection = new THREE.Vector3(),
          objectUpDirection = new THREE.Vector3(),
          objectSidewaysDirection = new THREE.Vector3(),
          moveDirection = new THREE.Vector3();
        return function rotateCamera() {

          moveDirection.set( _moveCurr.x - _movePrev.x, _moveCurr.y - _movePrev.y, 0 );
          let angle = moveDirection.length();

          if ( angle ) {

            _eye.copy( scope.object.position ).sub( scope.target );

            eyeDirection.copy( _eye ).normalize();
            objectUpDirection.copy( scope.object.up ).normalize();
            objectSidewaysDirection.crossVectors( objectUpDirection, eyeDirection ).normalize();
            objectUpDirection.setLength( _moveCurr.y - _movePrev.y );
            objectSidewaysDirection.setLength( _moveCurr.x - _movePrev.x );
            moveDirection.copy( objectUpDirection.add( objectSidewaysDirection ) );
            axis.crossVectors( moveDirection, _eye ).normalize();
            angle *= scope.rotateSpeed;
            quaternion.setFromAxisAngle( axis, angle );

            _eye.applyQuaternion( quaternion );

            scope.object.up.applyQuaternion( quaternion );

            _lastAxis.copy( axis );

            _lastAngle = angle;

          } else if ( ! scope.staticMoving && _lastAngle ) {

            _lastAngle *= Math.sqrt( 1.0 - scope.dynamicDampingFactor );

            _eye.copy( scope.object.position ).sub( scope.target );

            quaternion.setFromAxisAngle( _lastAxis, _lastAngle );

            _eye.applyQuaternion( quaternion );

            scope.object.up.applyQuaternion( quaternion );

          }

          _movePrev.copy( _moveCurr );

        };

      }();

      this.zoomCamera = function () {
        let factor;

        if ( _state === STATE.TOUCH_ZOOM_PAN ) {

          factor = _touchZoomDistanceStart / _touchZoomDistanceEnd;

          _touchZoomDistanceStart = _touchZoomDistanceEnd;

          if ( scope.object.isPerspectiveCamera ) {

            _eye.multiplyScalar( factor );

          } else if ( scope.object.isOrthographicCamera ) {

            scope.object.zoom *= factor;
            scope.object.updateProjectionMatrix();

          } else {

            console.warn( 'THREE.TrackballControls: Unsupported camera type' );

          }

        } else {

          var zoomDeltaY = _zoomEnd.y - _zoomStart.y;

          factor = 1.0 + ( _zoomEnd.y - _zoomStart.y ) * scope.zoomSpeed;

          if ( factor !== 1.0 && factor > 0.0 ) {

            // we're zooming in -- zoom towards cursor
            var dest = new THREE.Vector3();

            if (zoomDeltaY < 0) {

              // determine the coordinates to zoom towards
              dest.set(scope.mousePosition.x, scope.mousePosition.y, 0.0);

              // convert target from screen coords (0:1) to clip coords (-1:1)
              dest = dest.addScalar(-0.5).multiplyScalar(2.0);

              // convert the destination from clip coords to world coords
              dest.unproject(scope.object);

              var direction = dest.sub(scope.object.position).normalize(),

                  distance = - scope.object.position.z / direction.z,

                  scaled = direction.multiplyScalar(distance);

              dest = scope.object.position.clone().add(scaled);

            // we're zooming out -- zoom towards origin
            } else {

              dest.set(0.0, 0.0, 1.0);
              dest = scope.object.position.clone().sub(dest);

            }

            // find the distance we're scrolling in the z plane
            var zz = _eye.clone().multiplyScalar(factor).z - _eye.clone().z;

            // use the percent of zoom in the z dimension to scale changes in x y planes
            var pz = zz / scope.object.position.z;

            // apply the translation force in the x y planes
            var pan = new THREE.Vector3(),
                objectUp = new THREE.Vector3();

            // find the distance between camera and destination in the x & y planes
            var dx = dest.x - scope.object.position.x,
                dy = dest.y - scope.object.position.y;

            // determine the amount of change in the x y planes
            var planeChange = new THREE.Vector2(dx * pz, dy * pz);

            // apply the x pan component
            pan.copy( _eye ).cross( scope.object.up ).setLength(planeChange.x);

            // apply the y pan component
            pan.add( objectUp.copy( scope.object.up ).setLength(planeChange.y) );

            // actually add those forces to the target
            scope.target.add(pan)

            if ( scope.object.isPerspectiveCamera ) {

              _eye.multiplyScalar( factor );

            } else if ( scope.object.isOrthographicCamera ) {

              scope.object.zoom /= factor;

              scope.object.updateProjectionMatrix();

            } else {

              console.warn( 'THREE.TrackballControls: Unsupported camera type' );
            }

          }

          if ( scope.staticMoving ) {

            _zoomStart.copy( _zoomEnd );

          } else {

            _zoomStart.y += ( _zoomEnd.y - _zoomStart.y ) * this.dynamicDampingFactor;

          }
        }
      };

      this.panCamera = function () {

        const mouseChange = new THREE.Vector2(),
          objectUp = new THREE.Vector3(),
          pan = new THREE.Vector3();
        return function panCamera() {

          mouseChange.copy( _panEnd ).sub( _panStart );

          if ( mouseChange.lengthSq() ) {

            if ( scope.object.isOrthographicCamera ) {

              const scale_x = ( scope.object.right - scope.object.left ) / scope.object.zoom / scope.domElement.clientWidth;
              const scale_y = ( scope.object.top - scope.object.bottom ) / scope.object.zoom / scope.domElement.clientWidth;
              mouseChange.x *= scale_x;
              mouseChange.y *= scale_y;

            }

            mouseChange.multiplyScalar( _eye.length() * scope.panSpeed );
            pan.copy( _eye ).cross( scope.object.up ).setLength( mouseChange.x );
            pan.add( objectUp.copy( scope.object.up ).setLength( mouseChange.y ) );
            scope.object.position.add( pan );
            scope.target.add( pan );

            if ( scope.staticMoving ) {

              _panStart.copy( _panEnd );

            } else {

              _panStart.add( mouseChange.subVectors( _panEnd, _panStart ).multiplyScalar( scope.dynamicDampingFactor ) );

            }

          }

        };

      }();

      this.checkDistances = function () {

        if ( ! scope.noZoom || ! scope.noPan ) {

          if ( _eye.lengthSq() > scope.maxDistance * scope.maxDistance ) {

            scope.object.position.addVectors( scope.target, _eye.setLength( scope.maxDistance ) );

            _zoomStart.copy( _zoomEnd );

          }

          if ( _eye.lengthSq() < scope.minDistance * scope.minDistance ) {

            scope.object.position.addVectors( scope.target, _eye.setLength( scope.minDistance ) );

            _zoomStart.copy( _zoomEnd );

          }

        }

      };

      this.update = function () {

        _eye.subVectors(scope.object.position, scope.target);

        if ( ! scope.noRotate ) {

          scope.rotateCamera();

        }

        if ( ! scope.noZoom ) {

          scope.zoomCamera();

        }

        if ( ! scope.noPan ) {

          scope.panCamera();

        }

        scope.object.position.addVectors(scope.target, _eye);

        if ( scope.object.isPerspectiveCamera ) {

          scope.checkDistances();
          scope.object.lookAt( scope.target );

          if ( lastPosition.distanceToSquared( scope.object.position ) > EPS ) {

            scope.dispatchEvent( _changeEvent );
            lastPosition.copy( scope.object.position );

          }

        } else if ( scope.object.isOrthographicCamera ) {

          scope.object.lookAt( scope.target );

          if ( lastPosition.distanceToSquared( scope.object.position ) > EPS || lastZoom !== scope.object.zoom ) {

            scope.dispatchEvent( _changeEvent );
            lastPosition.copy( scope.object.position );
            lastZoom = scope.object.zoom;

          }

        } else {

          console.warn( 'THREE.TrackballControls: Unsupported camera type' );

        }

      };

      this.reset = function () {

        _state = STATE.NONE;
        _keyState = STATE.NONE;
        scope.target.copy( scope.target0 );
        scope.object.position.copy( scope.position0 );
        scope.object.up.copy( scope.up0 );
        scope.object.zoom = scope.zoom0;
        scope.object.updateProjectionMatrix();

        _eye.subVectors( scope.object.position, scope.target );

        scope.object.lookAt( scope.target );
        scope.dispatchEvent( _changeEvent );
        lastPosition.copy( scope.object.position );
        lastZoom = scope.object.zoom;

      }; // listeners


      function onPointerDown( event ) {

        if ( scope.enabled === false ) return;

        if ( _pointers.length === 0 ) {

          scope.domElement.setPointerCapture( event.pointerId );
          scope.domElement.addEventListener( 'pointerup', onPointerUp );

        } //


        addPointer( event );

        if ( event.pointerType === 'touch' ) {

          onTouchStart( event );

        } else {

          onMouseDown( event );

        }

      }

      function onPointerMove( event ) {

        scope.mousePosition.copy(getMouseOnScreen( event.pageX, event.pageY ));

        if ( scope.enabled === false ) return;

        if ( event.pointerType === 'touch' ) {

          onTouchMove( event );

        } else {

          onMouseMove( event );

        }

      }

      function onPointerUp( event ) {

        if ( scope.enabled === false ) return;

        if ( event.pointerType === 'touch' ) {

          onTouchEnd( event );

        } else {

          onMouseUp();

        } //


        removePointer( event );

        if ( _pointers.length === 0 ) {

          scope.domElement.releasePointerCapture( event.pointerId );
          scope.domElement.removeEventListener( 'pointerup', onPointerUp );

        }

      }

      function onPointerCancel( event ) {

        removePointer( event );

      }

      function keydown( event ) {

        if ( scope.enabled === false ) return;
        window.removeEventListener( 'keydown', keydown );

        if ( _keyState !== STATE.NONE ) {

          return;

        } else if ( event.code === scope.keys[ STATE.ROTATE ] && ! scope.noRotate ) {

          _keyState = STATE.ROTATE;

        } else if ( event.code === scope.keys[ STATE.ZOOM ] && ! scope.noZoom ) {

          _keyState = STATE.ZOOM;

        } else if ( event.code === scope.keys[ STATE.PAN ] && ! scope.noPan ) {

          _keyState = STATE.PAN;

        }

      }

      function keyup() {

        if ( scope.enabled === false ) return;
        _keyState = STATE.NONE;
        window.addEventListener( 'keydown', keydown );

      }

      function onMouseDown( event ) {

        if ( _state === STATE.NONE ) {

          switch ( event.button ) {

            case scope.mouseButtons.LEFT:
              _state = STATE.ROTATE;
              break;

            case scope.mouseButtons.MIDDLE:
              _state = STATE.ZOOM;
              break;

            case scope.mouseButtons.RIGHT:
              _state = STATE.PAN;
              break;

            default:
              _state = STATE.NONE;

          }

        }

        const state = _keyState !== STATE.NONE ? _keyState : _state;

        if ( state === STATE.ROTATE && ! scope.noRotate ) {

          _moveCurr.copy( getMouseOnCircle( event.pageX, event.pageY ) );

          _movePrev.copy( _moveCurr );

        } else if ( state === STATE.ZOOM && ! scope.noZoom ) {

          _zoomStart.copy( getMouseOnScreen( event.pageX, event.pageY ) );

          _zoomEnd.copy( _zoomStart );

        } else if ( state === STATE.PAN && ! scope.noPan ) {

          _panStart.copy( getMouseOnScreen( event.pageX, event.pageY ) );

          _panEnd.copy( _panStart );

        }

        scope.dispatchEvent( _startEvent );

      }

      function onMouseMove( event ) {

        const state = _keyState !== STATE.NONE ? _keyState : _state;

        if ( state === STATE.ROTATE && ! scope.noRotate ) {

          _movePrev.copy( _moveCurr );

          _moveCurr.copy( getMouseOnCircle( event.pageX, event.pageY ) );

        } else if ( state === STATE.ZOOM && ! scope.noZoom ) {

          _zoomEnd.copy( getMouseOnScreen( event.pageX, event.pageY ) );

        } else if ( state === STATE.PAN && ! scope.noPan ) {

          _panEnd.copy( getMouseOnScreen( event.pageX, event.pageY ) );

        }

      }

      function onMouseUp() {

        _state = STATE.NONE;
        scope.dispatchEvent( _endEvent );

      }

      function onMouseWheel( event ) {
        if ( scope.enabled === false ) return;
        if ( scope.noZoom === true ) return;
        event.preventDefault();

        switch ( event.deltaMode ) {

          case 2:
            // Zoom in pages
            _zoomStart.y -= event.deltaY * 0.025;
            break;

          case 1:
            // Zoom in lines
            _zoomStart.y -= event.deltaY * 0.01;
            break;

          default:
            // undefined, 0, assume pixels
            _zoomStart.y -= event.deltaY * 0.00025;
            break;

        }

        scope.dispatchEvent( _startEvent );
        scope.dispatchEvent( _endEvent );

      }

      function onTouchStart( event ) {

        trackPointer( event );

        switch ( _pointers.length ) {

          case 1:
            _state = STATE.TOUCH_ROTATE;

            _moveCurr.copy( getMouseOnCircle( _pointers[ 0 ].pageX, _pointers[ 0 ].pageY ) );

            _movePrev.copy( _moveCurr );

            break;

          default:
            // 2 or more
            _state = STATE.TOUCH_ZOOM_PAN;
            const dx = _pointers[ 0 ].pageX - _pointers[ 1 ].pageX;
            const dy = _pointers[ 0 ].pageY - _pointers[ 1 ].pageY;
            _touchZoomDistanceEnd = _touchZoomDistanceStart = Math.sqrt( dx * dx + dy * dy );
            const x = ( _pointers[ 0 ].pageX + _pointers[ 1 ].pageX ) / 2;
            const y = ( _pointers[ 0 ].pageY + _pointers[ 1 ].pageY ) / 2;

            _panStart.copy( getMouseOnScreen( x, y ) );

            _panEnd.copy( _panStart );

            break;

        }

        scope.dispatchEvent( _startEvent );

      }

      function onTouchMove( event ) {

        trackPointer( event );

        switch ( _pointers.length ) {

          case 1:
            _movePrev.copy( _moveCurr );

            _moveCurr.copy( getMouseOnCircle( event.pageX, event.pageY ) );

            break;

          default:
            // 2 or more
            const position = getSecondPointerPosition( event );
            const dx = event.pageX - position.x;
            const dy = event.pageY - position.y;
            _touchZoomDistanceEnd = Math.sqrt( dx * dx + dy * dy );
            const x = ( event.pageX + position.x ) / 2;
            const y = ( event.pageY + position.y ) / 2;

            _panEnd.copy( getMouseOnScreen( x, y ) );

            break;

        }

      }

      function onTouchEnd( event ) {

        switch ( _pointers.length ) {

          case 0:
            _state = STATE.NONE;
            break;

          case 1:
            _state = STATE.TOUCH_ROTATE;

            _moveCurr.copy( getMouseOnCircle( event.pageX, event.pageY ) );

            _movePrev.copy( _moveCurr );

            break;

          case 2:
            _state = STATE.TOUCH_ZOOM_PAN;

            _moveCurr.copy( getMouseOnCircle( event.pageX - _movePrev.pageX, event.pageY - _movePrev.pageY ) );

            _movePrev.copy( _moveCurr );

            break;

        }

        scope.dispatchEvent( _endEvent );

      }

      function contextmenu( event ) {

        if ( scope.enabled === false ) return;
        event.preventDefault();

      }

      function addPointer( event ) {

        _pointers.push( event );

      }

      function removePointer( event ) {

        delete _pointerPositions[ event.pointerId ];

        for ( let i = 0; i < _pointers.length; i ++ ) {

          if ( _pointers[ i ].pointerId == event.pointerId ) {

            _pointers.splice( i, 1 );

            return;

          }

        }

      }

      function trackPointer( event ) {

        let position = _pointerPositions[ event.pointerId ];

        if ( position === undefined ) {

          position = new THREE.Vector2();
          _pointerPositions[ event.pointerId ] = position;

        }

        position.set( event.pageX, event.pageY );

      }

      function getSecondPointerPosition( event ) {

        const pointer = event.pointerId === _pointers[ 0 ].pointerId ? _pointers[ 1 ] : _pointers[ 0 ];
        return _pointerPositions[ pointer.pointerId ];

      }

      this.dispose = function () {

        scope.domElement.removeEventListener( 'contextmenu', contextmenu );
        scope.domElement.removeEventListener( 'pointerdown', onPointerDown );
        scope.domElement.removeEventListener( 'pointercancel', onPointerCancel );
        scope.domElement.removeEventListener( 'wheel', onMouseWheel );
        scope.domElement.removeEventListener( 'pointermove', onPointerMove );
        scope.domElement.removeEventListener( 'pointerup', onPointerUp );
        window.removeEventListener( 'keydown', keydown );
        window.removeEventListener( 'keyup', keyup );

      };

      this.domElement.addEventListener( 'pointermove', onPointerMove );
      this.domElement.addEventListener( 'contextmenu', contextmenu );
      this.domElement.addEventListener( 'pointerdown', onPointerDown );
      this.domElement.addEventListener( 'pointercancel', onPointerCancel );
      this.domElement.addEventListener( 'wheel', onMouseWheel, {
        passive: false
      } );

      // --- Asynchronous pan/zoom with key tracking ---
      var activeKeys = new Set();
      var panZoomAnimationId = null;
      var panStepDefault = 0.001;
      var panStepFast = 0.05;
      var panStep = panStepDefault;
      var zoomInFactorDefault = 0.999;
      var zoomOutFactorDefault = 1.001;
      var zoomInFactorFast = 0.98;
      var zoomOutFactorFast = 1.02;
      var zoomInFactor = zoomInFactorDefault;
      var zoomOutFactor = zoomOutFactorDefault;

      function panZoomLoop() {
        var didAction = false;
        // Adjust zoom factors if shift is pressed
        if (activeKeys.has('Shift')) {
          zoomInFactor = zoomInFactorFast;
          zoomOutFactor = zoomOutFactorFast;
          panStep = panStepFast;
        } else {
          zoomInFactor = zoomInFactorDefault;
          zoomOutFactor = zoomOutFactorDefault;
          panStep = panStepDefault;
        }
        // Pan
        if (activeKeys.has('ArrowLeft')) {
          scope.panBy(-panStep, 0);
          didAction = true;
        }
        if (activeKeys.has('ArrowRight')) {
          scope.panBy(panStep, 0);
          didAction = true;
        }
        if (activeKeys.has('ArrowUp')) {
          scope.panBy(0, panStep);
          didAction = true;
        }
        if (activeKeys.has('ArrowDown')) {
          scope.panBy(0, -panStep);
          didAction = true;
        }
        // Zoom with + and -
        if (activeKeys.has('+') || activeKeys.has('=')) { // = for unshifted +
          scope.zoomBy(zoomInFactor);
          didAction = true;
        }
        if (activeKeys.has('-') || activeKeys.has('_')) {
          scope.zoomBy(zoomOutFactor);
          didAction = true;
        }
        if (didAction) scope.update();
        // Continue loop if any keys are still pressed
        if (activeKeys.size > 0) {
          panZoomAnimationId = requestAnimationFrame(panZoomLoop);
        } else {
          panZoomAnimationId = null;
        }
      }

      window.addEventListener('keydown', function(event) {
        if (!scope.enabled) return;
        // Track shift separately
        if (event.key === 'Shift') activeKeys.add('Shift');
        else activeKeys.add(event.key);
        if (!panZoomAnimationId) panZoomLoop();
        // Prevent default for handled keys
        if ([
          'ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','=','_'
        ].includes(event.key)) {
          event.preventDefault();
        }
      });
      window.addEventListener('keyup', function(event) {
        if (event.key === 'Shift') activeKeys.delete('Shift');
        else activeKeys.delete(event.key);
        // Animation loop will stop itself if no keys are pressed
      });

      this.zoomBy = function(factor) {
        console.log('[TrackballControls] zoomBy called with factor:', factor, 'camera position:', scope.object.position);
        if (scope.object.isPerspectiveCamera) {
          _eye.multiplyScalar(factor);
          // After zoom, update camera position
          scope.object.position.addVectors(scope.target, _eye);
        } else if (scope.object.isOrthographicCamera) {
          scope.object.zoom *= factor;
          scope.object.updateProjectionMatrix();
        }
        // Recalculate _eye from the new camera position and target
        _eye.subVectors(scope.object.position, scope.target);
      };

      this.panBy = function(dx, dy) {
        // Pan in camera's local x/y axes
        var pan = new THREE.Vector3();
        var te = scope.object.matrix.elements;
        // te[0], te[1], te[2] is the camera's right vector
        // te[4], te[5], te[6] is the camera's up vector
        pan.set(te[0], te[1], te[2]).multiplyScalar(dx);
        pan.add(new THREE.Vector3(te[4], te[5], te[6]).multiplyScalar(dy));
        scope.object.position.add(pan);
        scope.target.add(pan);
        _eye.subVectors(scope.object.position, scope.target);
      };
      
      this.handleResize(); // force an update at start

      this.update();

    }

  }

  THREE.TrackballControls = TrackballControls;

} )();

