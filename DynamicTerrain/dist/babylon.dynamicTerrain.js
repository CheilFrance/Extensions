var BABYLON;
(function (BABYLON) {
    var DynamicTerrain = (function () {
        /**
         * constructor
         * @param name
         * @param options
         * @param scene
         * @param {*} mapData the array of the map 3D data : x, y, z successive float values
         * @param {*} mapSubX the data map number of x subdivisions : integer
         * @param {*} mapSubZ the data map number of z subdivisions : integer
         * @param {*} terrainSub the wanted terrain number of subdivisions : integer, multiple of 2.
         * @param {*} mapUVs the array of the map UV data (optional) : u,v successive values, each between 0 and 1.
         * @param {*} mapColors the array of the map Color data (optional) : x, y, z successive float values.
         * @param {*} mapNormals the array of the map normal data (optional) : r,g,b successive values, each between 0 and 1.
         * @param {*} invertSide boolean, to invert the terrain mesh upside down. Default false.
         * @param {*} camera the camera to link the terrain to. Optional, by default the scene active camera
         */
        function DynamicTerrain(name, options, scene) {
            var _this = this;
            this._subToleranceX = 1; // how many cells flought over thy the camera on the terrain x axis before update
            this._subToleranceZ = 1; // how many cells flought over thy the camera on the terrain z axis before update
            this._LODLimits = []; // array of LOD limits
            this._initialLOD = 1; // initial LOD value (integer > 0)
            this._LODValue = 1; // current LOD value : initial + camera correction
            this._cameraLODCorrection = 0; // LOD correction (integer) according to the camera altitude
            this._oldCorrection = 0; // former correction
            this._deltaX = 0.0; // camera / terrain x position delta
            this._deltaZ = 0.0; // camera-/ terrain z position delta
            this._signX = 0; // x delta sign
            this._signZ = 0; // z delta sign
            this._deltaSubX = 0; // map x subdivision delta 
            this._deltaSubZ = 0; // map z subdivision delta 
            this._mapShiftX = 0.0; // x shift in world space
            this._mapShiftZ = 0.0; // z shift in world space
            this._mapFlgtNb = 0; // tmp number of map cells flought over by the camera in the delta shift
            this._needsUpdate = false; // boolean : the ribbon needs to be recomputed
            this._updateLOD = false; // boolean : ribbon recomputation + LOD change
            this._updateForced = false; // boolean : forced ribbon recomputation
            this._refreshEveryFrame = false; // boolean : to force the terrain computation every frame
            this._useCustomVertexFunction = false; // boolean : to allow the call to updateVertex()
            this._computeNormals = false; // boolean : to skip or not the normal computation
            this._datamap = false; // boolean : true if an data map is passed as parameter
            this._uvmap = false; // boolean : true if an UV map is passed as parameter
            this._colormap = false; // boolean : true if an color map is passed as parameter
            this._vertex = {
                position: BABYLON.Vector3.Zero(),
                uvs: BABYLON.Vector2.Zero(),
                color: new BABYLON.Color4(1.0, 1.0, 1.0, 1.0),
                lodX: 1,
                lodZ: 1,
                worldPosition: BABYLON.Vector3.Zero(),
                mapIndex: 0 // current map index
            };
            this._averageSubSizeX = 0.0; // map cell average x size
            this._averageSubSizeZ = 0.0; // map cell average z size
            this._terrainSizeX = 0.0; // terrain x size
            this._terrainSizeZ = 0.0; // terrain y size
            this._terrainHalfSizeX = 0.0;
            this._terrainHalfSizeZ = 0.0;
            this._centerWorld = BABYLON.Vector3.Zero(); // terrain world center position
            this._centerLocal = BABYLON.Vector3.Zero(); // terrain local center position
            this._mapSizeX = 0.0; // map x size
            this._mapSizeZ = 0.0; // map z size
            this._isAlwaysVisible = false; // is the terrain mesh always selected for rendering
            this._precomputeNormalsFromMap = false; // if the normals must be precomputed from the map data when assigning a new map to the existing terrain
            this._bbMin = BABYLON.Vector3.Zero();
            this._bbMax = BABYLON.Vector3.Zero();
            this.name = name;
            this._terrainSub = options.terrainSub || 60;
            this._mapData = options.mapData;
            this._terrainIdx = this._terrainSub + 1;
            this._mapSubX = options.mapSubX || this._terrainIdx;
            this._mapSubZ = options.mapSubZ || this._terrainIdx;
            this._mapUVs = options.mapUVs; // if not defined, it will be still populated by default values
            this._mapColors = options.mapColors;
            this._scene = scene;
            this._terrainCamera = options.camera || scene.activeCamera;
            // initialize the map arrays if not passed as parameters
            this._datamap = (this._mapData) ? true : false;
            this._uvmap = (this._mapUVs) ? true : false;
            this._colormap = (this._mapColors) ? true : false;
            this._mapData = (this._datamap) ? this._mapData : new Float32Array(this._terrainIdx * this._terrainIdx * 3);
            this._mapUVs = (this._uvmap) ? this._mapUVs : new Float32Array(this._terrainIdx * this._terrainIdx * 2);
            if (this._datamap) {
                this._mapNormals = options.mapNormals || new Float32Array(this._mapSubX * this._mapSubZ * 3);
            }
            else {
                this._mapNormals = new Float32Array(this._terrainIdx * this._terrainIdx * 3);
            }
            // Ribbon creation
            var index = 0; // current vertex index in the map array
            var posIndex = 0; // current position (coords) index in the map array
            var colIndex = 0; // current color index in the color array
            var uvIndex = 0; // current uv index in the uv array
            var color; // current color
            var uv; // current uv
            var terIndex = 0; // current index in the terrain array
            var y = 0.0; // current y coordinate
            var terrainPath; // current path
            var u = 0.0; // current u of UV
            var v = 0.0; // current v of UV
            var lg = this._terrainIdx + 1; // augmented length for the UV to finish before
            var terrainData = [];
            var terrainColor = [];
            var terrainUV = [];
            for (var j = 0; j <= this._terrainSub; j++) {
                terrainPath = [];
                for (var i = 0; i <= this._terrainSub; i++) {
                    index = this._mod(j * 3, this._mapSubZ) * this._mapSubX + this._mod(i * 3, this._mapSubX);
                    posIndex = index * 3;
                    colIndex = index * 3;
                    uvIndex = index * 2;
                    terIndex = j * this._terrainIdx + i;
                    // geometry
                    if (this._datamap) {
                        y = this._mapData[posIndex + 1];
                    }
                    else {
                        y = 0.0;
                        this._mapData[3 * terIndex] = i;
                        this._mapData[3 * terIndex + 1] = y;
                        this._mapData[3 * terIndex + 2] = j;
                    }
                    terrainPath.push(new BABYLON.Vector3(i, y, j));
                    // color
                    if (this._colormap) {
                        color = new BABYLON.Color4(this._mapColors[colIndex], this._mapColors[colIndex + 1], this._mapColors[colIndex + 2], 1.0);
                    }
                    else {
                        color = new BABYLON.Color4(1.0, 1.0, 1.0, 1.0);
                    }
                    terrainColor.push(color);
                    // uvs
                    if (this._uvmap) {
                        uv = new BABYLON.Vector2(this._mapUVs[uvIndex], this._mapUVs[uvIndex + 1]);
                    }
                    else {
                        u = 1.0 - Math.abs(1.0 - 2.0 * i / lg);
                        v = 1.0 - Math.abs(1.0 - 2.0 * j / lg);
                        this._mapUVs[2 * terIndex] = u;
                        this._mapUVs[2 * terIndex + 1] = v;
                        uv = new BABYLON.Vector2(u, v);
                    }
                    terrainUV.push(uv);
                }
                terrainData.push(terrainPath);
            }
            this._mapSizeX = Math.abs(this._mapData[(this._mapSubX - 1) * 3] - this._mapData[0]);
            this._mapSizeZ = Math.abs(this._mapData[(this._mapSubZ - 1) * this._mapSubX * 3 + 2] - this._mapData[2]);
            this._averageSubSizeX = this._mapSizeX / this._mapSubX;
            this._averageSubSizeZ = this._mapSizeZ / this._mapSubZ;
            var ribbonOptions = {
                pathArray: terrainData,
                sideOrientation: (options.invertSide) ? BABYLON.Mesh.FRONTSIDE : BABYLON.Mesh.BACKSIDE,
                colors: terrainColor,
                uvs: terrainUV,
                updatable: true
            };
            this._terrain = BABYLON.MeshBuilder.CreateRibbon("terrain", ribbonOptions, this._scene);
            this._indices = this._terrain.getIndices();
            this._positions = this._terrain.getVerticesData(BABYLON.VertexBuffer.PositionKind);
            this._normals = this._terrain.getVerticesData(BABYLON.VertexBuffer.NormalKind);
            this._uvs = this._terrain.getVerticesData(BABYLON.VertexBuffer.UVKind);
            this._colors = this._terrain.getVerticesData(BABYLON.VertexBuffer.ColorKind);
            this.computeNormalsFromMap();
            // update it immediatly and register the update callback function in the render loop
            this.update(true);
            this._terrain.position.x = this._terrainCamera.globalPosition.x - this._terrainHalfSizeX;
            this._terrain.position.z = this._terrainCamera.globalPosition.z - this._terrainHalfSizeZ;
            // initialize deltaSub to make
            var deltaNbSubX = (this._terrain.position.x - this._mapData[0]) / this._averageSubSizeX;
            var deltaNbSubZ = (this._terrain.position.z - this._mapData[2]) / this._averageSubSizeZ;
            this._deltaSubX = (deltaNbSubX > 0) ? Math.floor(deltaNbSubX) : Math.ceil(deltaNbSubX);
            this._deltaSubZ = (deltaNbSubZ > 0) ? Math.floor(deltaNbSubZ) : Math.ceil(deltaNbSubZ);
            this._scene.registerBeforeRender(function () {
                _this.beforeUpdate(_this._refreshEveryFrame);
                _this.update(_this._refreshEveryFrame);
                _this.afterUpdate(_this._refreshEveryFrame);
            });
            this.update(true); // recompute everything once the initial deltas are calculated       
        }
        /**
         * Updates the terrain position and shape according to the camera position.
         * `force` : boolean, forces the terrain update even if no camera position change.
         * Returns the terrain.
         */
        DynamicTerrain.prototype.update = function (force) {
            this._needsUpdate = false;
            this._updateLOD = false;
            this._updateForced = (force) ? true : false;
            this._deltaX = this._terrainHalfSizeX + this._terrain.position.x - this._terrainCamera.globalPosition.x;
            this._deltaZ = this._terrainHalfSizeZ + this._terrain.position.z - this._terrainCamera.globalPosition.z;
            this._oldCorrection = this._cameraLODCorrection;
            this._cameraLODCorrection = (this.updateCameraLOD(this._terrainCamera)) | 0;
            this._updateLOD = (this._oldCorrection != this._cameraLODCorrection);
            this._LODValue = this._initialLOD + this._cameraLODCorrection;
            this._LODValue = (this._LODValue > 0) ? this._LODValue : 1;
            this._mapShiftX = this._averageSubSizeX * this._subToleranceX * this._LODValue;
            this._mapShiftZ = this._averageSubSizeZ * this._subToleranceZ * this._LODValue;
            if (Math.abs(this._deltaX) > this._mapShiftX) {
                this._signX = (this._deltaX > 0.0) ? -1 : 1;
                this._mapFlgtNb = Math.abs(this._deltaX / this._mapShiftX) | 0;
                this._terrain.position.x += this._mapShiftX * this._signX * this._mapFlgtNb;
                this._deltaSubX += (this._subToleranceX * this._signX * this._LODValue * this._mapFlgtNb);
                this._needsUpdate = true;
            }
            if (Math.abs(this._deltaZ) > this._mapShiftZ) {
                this._signZ = (this._deltaZ > 0.0) ? -1 : 1;
                this._mapFlgtNb = Math.abs(this._deltaZ / this._mapShiftZ) | 0;
                this._terrain.position.z += this._mapShiftZ * this._signZ * this._mapFlgtNb;
                this._deltaSubZ += (this._subToleranceZ * this._signZ * this._LODValue * this._mapFlgtNb);
                this._needsUpdate = true;
            }
            if (this._needsUpdate || this._updateLOD || this._updateForced) {
                this._deltaSubX = this._mod(this._deltaSubX, this._mapSubX);
                this._deltaSubZ = this._mod(this._deltaSubZ, this._mapSubZ);
                this._updateTerrain();
            }
            this._updateForced = false;
            this._updateLOD = false;
            this._centerLocal.x = this._terrainHalfSizeX;
            this._centerLocal.y = this._terrain.position.y;
            this._centerLocal.z = this._terrainHalfSizeZ;
            this._centerWorld.x = this._terrain.position.x + this._terrainHalfSizeX;
            this._centerWorld.y = this._terrain.position.y;
            this._centerWorld.z = this._terrain.position.z + this._terrainHalfSizeZ;
            return this;
        };
        // private : updates the underlying ribbon
        DynamicTerrain.prototype._updateTerrain = function () {
            var stepJ = 0 | 0;
            var stepI = 0 | 0;
            var LODLimitDown = 0 | 0;
            var LODLimitUp = 0 | 0;
            var LODValue = this._LODValue;
            var lodI = LODValue;
            var lodJ = LODValue;
            var l = 0 | 0;
            var index = 0 | 0; // current vertex index in the map data array
            var posIndex = 0 | 0; // current position index in the map data array
            var colIndex = 0 | 0; // current index in the map color array
            var uvIndex = 0 | 0; // current index in the map uv array
            var terIndex = 0 | 0; // current vertex index in the terrain map array when used as a data map
            var ribbonInd = 0 | 0; // current ribbon vertex index
            var ribbonPosInd = 0 | 0; // current ribbon position index (same than normal index)
            var ribbonUVInd = 0 | 0; // current ribbon UV index
            var ribbonColInd = 0 | 0; // current ribbon color index
            var ribbonPosInd1 = 0 | 0;
            var ribbonPosInd2 = 0 | 0;
            var ribbonPosInd3 = 0 | 0;
            // note : all the indexes are explicitly set as integers for the js optimizer (store them all in the stack)
            if (this._updateLOD || this._updateForced) {
                this.updateTerrainSize();
            }
            BABYLON.Vector3.FromFloatsToRef(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE, this._bbMin);
            BABYLON.Vector3.FromFloatsToRef(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE, this._bbMax);
            for (var j = 0 | 0; j <= this._terrainSub; j++) {
                // LOD Z
                LODValue = this._LODValue;
                for (l = 0; l < this._LODLimits.length; l++) {
                    LODLimitDown = this._LODLimits[l];
                    LODLimitUp = this._terrainSub - LODLimitDown - 1;
                    if (j < LODLimitDown || j > LODLimitUp) {
                        LODValue = l + 1 + this._LODValue;
                    }
                    lodJ = LODValue;
                }
                for (var i = 0 | 0; i <= this._terrainSub; i++) {
                    // LOD X
                    LODValue = this._LODValue;
                    for (l = 0; l < this._LODLimits.length; l++) {
                        LODLimitDown = this._LODLimits[l];
                        LODLimitUp = this._terrainSub - LODLimitDown - 1;
                        if (i < LODLimitDown || i > LODLimitUp) {
                            LODValue = l + 1 + this._LODValue;
                        }
                        lodI = LODValue;
                    }
                    // map current index
                    index = this._mod(this._deltaSubZ + stepJ, this._mapSubZ) * this._mapSubX + this._mod(this._deltaSubX + stepI, this._mapSubX);
                    terIndex = this._mod(this._deltaSubZ + stepJ, this._terrainIdx) * this._terrainIdx + this._mod(this._deltaSubX + stepI, this._terrainIdx);
                    // related index in the array of positions (data map)
                    if (this._datamap) {
                        posIndex = 3 * index;
                    }
                    else {
                        posIndex = 3 * terIndex;
                    }
                    // related index in the UV map
                    if (this._uvmap) {
                        uvIndex = 2 * index;
                    }
                    else {
                        uvIndex = 2 * terIndex;
                    }
                    // related index in the color map
                    if (this._colormap) {
                        colIndex = 3 * index;
                    }
                    else {
                        colIndex = 3 * terIndex;
                    }
                    // ribbon indexes
                    ribbonPosInd = 3 * ribbonInd;
                    ribbonColInd = 4 * ribbonInd;
                    ribbonUVInd = 2 * ribbonInd;
                    ribbonPosInd1 = ribbonPosInd;
                    ribbonPosInd2 = ribbonPosInd + 1;
                    ribbonPosInd3 = ribbonPosInd + 2;
                    ribbonInd += 1;
                    // geometry                  
                    this._positions[ribbonPosInd1] = this._averageSubSizeX * stepI;
                    this._positions[ribbonPosInd2] = this._mapData[posIndex + 1];
                    this._positions[ribbonPosInd3] = this._averageSubSizeZ * stepJ;
                    if (!this._computeNormals) {
                        this._normals[ribbonPosInd1] = this._mapNormals[posIndex];
                        this._normals[ribbonPosInd2] = this._mapNormals[posIndex + 1];
                        this._normals[ribbonPosInd3] = this._mapNormals[posIndex + 2];
                    }
                    // bbox internal update
                    if (this._positions[ribbonPosInd1] < this._bbMin.x) {
                        this._bbMin.x = this._positions[ribbonPosInd1];
                    }
                    if (this._positions[ribbonPosInd1] > this._bbMax.x) {
                        this._bbMax.x = this._positions[ribbonPosInd1];
                    }
                    if (this._positions[ribbonPosInd2] < this._bbMin.y) {
                        this._bbMin.y = this._positions[ribbonPosInd2];
                    }
                    if (this._positions[ribbonPosInd2] > this._bbMax.y) {
                        this._bbMax.y = this._positions[ribbonPosInd2];
                    }
                    if (this._positions[ribbonPosInd3] < this._bbMin.z) {
                        this._bbMin.z = this._positions[ribbonPosInd3];
                    }
                    if (this._positions[ribbonPosInd3] > this._bbMax.z) {
                        this._bbMax.z = this._positions[ribbonPosInd3];
                    }
                    // color
                    var terrainIndex = j * this._terrainIdx + i;
                    if (this._colormap) {
                        this._colors[ribbonColInd] = this._mapColors[colIndex];
                        this._colors[ribbonColInd + 1] = this._mapColors[colIndex + 1];
                        this._colors[ribbonColInd + 2] = this._mapColors[colIndex + 2];
                    }
                    // uv : the array _mapUVs is always populated
                    this._uvs[ribbonUVInd] = this._mapUVs[uvIndex];
                    this._uvs[ribbonUVInd + 1] = this._mapUVs[uvIndex + 1];
                    // call to user custom function with the current updated vertex object
                    if (this._useCustomVertexFunction) {
                        this._vertex.position.copyFromFloats(this._positions[ribbonPosInd1], this._positions[ribbonPosInd2], this._positions[ribbonPosInd3]);
                        this._vertex.worldPosition.x = this._mapData[posIndex];
                        this._vertex.worldPosition.y = this._vertex.position.y;
                        this._vertex.worldPosition.z = this._mapData[posIndex + 2];
                        this._vertex.lodX = lodI;
                        this._vertex.lodZ = lodJ;
                        this._vertex.color.r = this._colors[ribbonColInd];
                        this._vertex.color.g = this._colors[ribbonColInd + 1];
                        this._vertex.color.b = this._colors[ribbonColInd + 2];
                        this._vertex.color.a = this._colors[ribbonColInd + 3];
                        this._vertex.uvs.x = this._uvs[ribbonUVInd];
                        this._vertex.uvs.y = this._uvs[ribbonUVInd + 1];
                        this._vertex.mapIndex = index;
                        this.updateVertex(this._vertex, i, j); // the user can modify the array values here
                        this._colors[ribbonColInd] = this._vertex.color.r;
                        this._colors[ribbonColInd + 1] = this._vertex.color.g;
                        this._colors[ribbonColInd + 2] = this._vertex.color.b;
                        this._colors[ribbonColInd + 3] = this._vertex.color.a;
                        this._uvs[ribbonUVInd] = this._vertex.uvs.x;
                        this._uvs[ribbonUVInd + 1] = this._vertex.uvs.y;
                        this._positions[ribbonPosInd1] = this._vertex.position.x;
                        this._positions[ribbonPosInd2] = this._vertex.position.y;
                        this._positions[ribbonPosInd3] = this._vertex.position.z;
                    }
                    stepI += lodI;
                }
                stepI = 0;
                stepJ += lodJ;
            }
            // ribbon update    
            this._terrain.updateVerticesData(BABYLON.VertexBuffer.PositionKind, this._positions, false, false);
            if (this._computeNormals) {
                BABYLON.VertexData.ComputeNormals(this._positions, this._indices, this._normals);
            }
            this._terrain.updateVerticesData(BABYLON.VertexBuffer.NormalKind, this._normals, false, false);
            this._terrain.updateVerticesData(BABYLON.VertexBuffer.UVKind, this._uvs, false, false);
            this._terrain.updateVerticesData(BABYLON.VertexBuffer.ColorKind, this._colors, false, false);
            this._terrain._boundingInfo = new BABYLON.BoundingInfo(this._bbMin, this._bbMax);
            this._terrain._boundingInfo.update(this._terrain._worldMatrix);
        };
        ;
        // private modulo, for dealing with negative indexes
        DynamicTerrain.prototype._mod = function (a, b) {
            return ((a % b) + b) % b;
        };
        /**
         * Updates the mesh terrain size according to the LOD limits and the camera position.
         * Returns the terrain.
         */
        DynamicTerrain.prototype.updateTerrainSize = function () {
            var remainder = this._terrainSub; // the remaining cells at the general current LOD value
            var nb = 0 | 0; // nb of cells in the current LOD limit interval
            var next = 0 | 0; // next cell index, if it exists
            var lod = this._LODValue + 1; // lod value in the current LOD limit interval
            var tsx = 0.0; // current sum of cell sizes on x
            var tsz = 0.0; // current sum of cell sizes on z
            for (var l = 0 | 0; l < this._LODLimits.length; l++) {
                lod = this._LODValue + l + 1;
                next = (l >= this._LODLimits.length - 1) ? 0 : this._LODLimits[l + 1];
                nb = 2 * (this._LODLimits[l] - next);
                tsx += this._averageSubSizeX * lod * nb;
                tsz += this._averageSubSizeZ * lod * nb;
                remainder -= nb;
            }
            tsx += remainder * this._averageSubSizeX * this._LODValue;
            tsz += remainder * this._averageSubSizeZ * this._LODValue;
            this._terrainSizeX = tsx;
            this._terrainSizeZ = tsz;
            this._terrainHalfSizeX = tsx * 0.5;
            this._terrainHalfSizeZ = tsz * 0.5;
            return this;
        };
        /**
         * Returns the altitude (float) at the coordinates (x, z) of the map.
         * @param x
         * @param z
         * @param {normal: Vector3} (optional)
         * If the optional object {normal: Vector3} is passed, then its property "normal" is updated with the normal vector value at the coordinates (x, z).
         */
        DynamicTerrain.prototype.getHeightFromMap = function (x, z, options) {
            return DynamicTerrain._GetHeightFromMap(x, z, this._mapData, this._mapSubX, this._mapSubZ, this._mapSizeX, this._mapSizeZ, options);
        };
        /**
         * Static : Returns the altitude (float) at the coordinates (x, z) of the passed map.
         * @param x
         * @param z
         * @param mapSubX the number of points along the map width
         * @param mapSubX the number of points along the map height
         * @param {normal: Vector3} (optional)
         * If the optional object {normal: Vector3} is passed, then its property "normal" is updated with the normal vector value at the coordinates (x, z).
         */
        DynamicTerrain.GetHeightFromMap = function (x, z, mapData, mapSubX, mapSubZ, options) {
            var mapSizeX = Math.abs(mapData[(mapSubX - 1) * 3] - mapData[0]);
            var mapSizeZ = Math.abs(mapData[(mapSubZ - 1) * mapSubX * 3 + 2] - mapData[2]);
            return DynamicTerrain._GetHeightFromMap(x, z, mapData, mapSubX, mapSubZ, mapSizeX, mapSizeZ, options);
        };
        // Computes the height and optionnally the normal at the coordinates (x ,z) from the passed map
        DynamicTerrain._GetHeightFromMap = function (x, z, mapData, mapSubX, mapSubZ, mapSizeX, mapSizeZ, options) {
            var x0 = mapData[0];
            var z0 = mapData[2];
            // reset x and z in the map space so they are between 0 and the axis map size
            x = x - Math.floor((x - x0) / mapSizeX) * mapSizeX;
            z = z - Math.floor((z - z0) / mapSizeZ) * mapSizeZ;
            var col1 = Math.floor((x - x0) * mapSubX / mapSizeX);
            var row1 = Math.floor((z - z0) * mapSubZ / mapSizeZ);
            var col2 = (col1 + 1) % mapSubX;
            var row2 = (row1 + 1) % mapSubZ;
            // starting indexes of the positions of 4 vertices defining a quad on the map
            var idx1 = 3 * (row1 * mapSubX + col1);
            var idx2 = 3 * (row1 * mapSubX + col2);
            var idx3 = 3 * ((row2) * mapSubX + col1);
            var idx4 = 3 * ((row2) * mapSubX + col2);
            DynamicTerrain._v1.copyFromFloats(mapData[idx1], mapData[idx1 + 1], mapData[idx1 + 2]);
            DynamicTerrain._v2.copyFromFloats(mapData[idx2], mapData[idx2 + 1], mapData[idx2 + 2]);
            DynamicTerrain._v3.copyFromFloats(mapData[idx3], mapData[idx3 + 1], mapData[idx3 + 2]);
            DynamicTerrain._v4.copyFromFloats(mapData[idx4], mapData[idx4 + 1], mapData[idx4 + 2]);
            var vA = DynamicTerrain._v1;
            var vB;
            var vC;
            var v;
            var xv4v1 = DynamicTerrain._v4.x - DynamicTerrain._v1.x;
            var zv4v1 = DynamicTerrain._v4.z - DynamicTerrain._v1.z;
            if (xv4v1 == 0 || zv4v1 == 0) {
                return DynamicTerrain._v1.y;
            }
            var cd = zv4v1 / xv4v1;
            var h = DynamicTerrain._v1.z - cd * DynamicTerrain._v1.x;
            if (z < cd * x + h) {
                vB = DynamicTerrain._v4;
                vC = DynamicTerrain._v2;
                v = vA;
            }
            else {
                vB = DynamicTerrain._v3;
                vC = DynamicTerrain._v4;
                v = vB;
            }
            vB.subtractToRef(vA, DynamicTerrain._vAvB);
            vC.subtractToRef(vA, DynamicTerrain._vAvC);
            BABYLON.Vector3.CrossToRef(DynamicTerrain._vAvB, DynamicTerrain._vAvC, DynamicTerrain._norm);
            DynamicTerrain._norm.normalize();
            if (options && options.normal) {
                options.normal.copyFrom(DynamicTerrain._norm);
            }
            var d = -(DynamicTerrain._norm.x * v.x + DynamicTerrain._norm.y * v.y + DynamicTerrain._norm.z * v.z);
            var y = v.y;
            if (DynamicTerrain._norm.y != 0.0) {
                y = -(DynamicTerrain._norm.x * x + DynamicTerrain._norm.z * z + d) / DynamicTerrain._norm.y;
            }
            return y;
        };
        /**
         * Static : Computes all the normals from the terrain data map  and stores them in the passed Float32Array reference.
         * This passed array must have the same size than the mapData array.
         */
        DynamicTerrain.ComputeNormalsFromMapToRef = function (mapData, mapSubX, mapSubZ, normals) {
            var mapIndices = [];
            var tmp1 = { normal: BABYLON.Vector3.Zero() };
            var tmp2 = { normal: BABYLON.Vector3.Zero() };
            var l = mapSubX * (mapSubZ - 1);
            var i = 0;
            for (i = 0; i < l; i++) {
                mapIndices.push(i + 1, i + mapSubX, i);
                mapIndices.push(i + mapSubX, i + 1, i + mapSubX + 1);
            }
            BABYLON.VertexData.ComputeNormals(mapData, mapIndices, normals);
            // seam process
            var lastIdx = (mapSubX - 1) * 3;
            var colStart = 0;
            var colEnd = 0;
            for (i = 0; i < mapSubZ; i++) {
                colStart = i * mapSubX * 3;
                colEnd = colStart + lastIdx;
                DynamicTerrain.GetHeightFromMap(mapData[colStart], mapData[colStart + 2], mapData, mapSubX, mapSubZ, tmp1);
                DynamicTerrain.GetHeightFromMap(mapData[colEnd], mapData[colEnd + 2], mapData, mapSubX, mapSubZ, tmp2);
                tmp1.normal.addInPlace(tmp2.normal).scaleInPlace(0.5);
                normals[colStart] = tmp1.normal.x;
                normals[colStart + 1] = tmp1.normal.y;
                normals[colStart + 2] = tmp1.normal.z;
                normals[colEnd] = tmp1.normal.x;
                normals[colEnd + 1] = tmp1.normal.y;
                normals[colEnd + 2] = tmp1.normal.z;
            }
        };
        /**
         * Computes all the map normals from the current terrain data map and sets them to the terrain.
         * Returns the terrain.
         */
        DynamicTerrain.prototype.computeNormalsFromMap = function () {
            DynamicTerrain.ComputeNormalsFromMapToRef(this._mapData, this._mapSubX, this._mapSubZ, this._mapNormals);
            return this;
        };
        /**
         * Returns true if the World coordinates (x, z) are in the current terrain.
         * @param x
         * @param z
         */
        DynamicTerrain.prototype.contains = function (x, z) {
            if (x < this._positions[0] + this.mesh.position.x || x > this._positions[3 * this._terrainIdx] + this.mesh.position.x) {
                return false;
            }
            if (z < this._positions[2] + this.mesh.position.z || z > this._positions[3 * this._terrainIdx * this._terrainIdx + 2] + this.mesh.position.z) {
                return false;
            }
            return true;
        };
        /**
         * Static : Returns a new data map from the passed heightmap image file.
         The parameters `width` and `height` (positive floats, default 300) set the map width and height sizes.
         * `subX` is the wanted number of points along the map width (default 100).
         * `subZ` is the wanted number of points along the map height (default 100).
         * The parameter `minHeight` (float, default 0) is the minimum altitude of the map.
         * The parameter `maxHeight` (float, default 1) is the maximum altitude of the map.
         * The parameter `colorFilter` (optional Color3, default (0.3, 0.59, 0.11) ) is the filter to apply to the image pixel colors to compute the height.
         * `onReady` is an optional callback function, called once the map is computed. It's passed the computed map.
         * `scene` is the Scene object whose database will store the downloaded image.
         */
        DynamicTerrain.CreateMapFromHeightMap = function (heightmapURL, options, scene) {
            var subX = options.subX || 100;
            var subZ = options.subZ || 100;
            var data = new Float32Array(subX * subZ * 3);
            DynamicTerrain.CreateMapFromHeightMapToRef(heightmapURL, options, data, scene);
            return data;
        };
        /**
         * Static : Updates the passed array or Float32Array with a data map computed from the passed heightmap image file.
         *  The parameters `width` and `height` (positive floats, default 300) set the map width and height sizes.
         * `subX` is the wanted number of points along the map width (default 100).
         * `subZ` is the wanted number of points along the map height (default 100).
         * The parameter `minHeight` (float, default 0) is the minimum altitude of the map.
         * The parameter `maxHeight` (float, default 1) is the maximum altitude of the map.
         * The parameter `colorFilter` (optional Color3, default (0.3, 0.59, 0.11) ) is the filter to apply to the image pixel colors to compute the height.
         * `onReady` is an optional callback function, called once the map is computed. It's passed the computed map.
         * `scene` is the Scene object whose database will store the downloaded image.
         * The passed Float32Array must be the right size : 3 x subX x subZ.
         */
        DynamicTerrain.CreateMapFromHeightMapToRef = function (heightmapURL, options, data, scene) {
            var width = options.width || 300;
            var height = options.height || 300;
            var subX = options.subX || 100;
            var subZ = options.subZ || 100;
            var minHeight = options.minHeight || 0.0;
            var maxHeight = options.maxHeight || 10.0;
            var offsetX = options.offsetX || 0.0;
            var offsetZ = options.offsetZ || 0.0;
            var filter = options.colorFilter || new BABYLON.Color3(0.3, 0.59, 0.11);
            var onReady = options.onReady;
            var onload = function (img) {
                // Getting height map data
                var canvas = document.createElement("canvas");
                var context = canvas.getContext("2d");
                var bufferWidth = img.width;
                var bufferHeight = img.height;
                canvas.width = bufferWidth;
                canvas.height = bufferHeight;
                context.drawImage(img, 0, 0);
                // Cast is due to wrong definition in lib.d.ts from ts 1.3 - https://github.com/Microsoft/TypeScript/issues/949
                var buffer = context.getImageData(0, 0, bufferWidth, bufferHeight).data;
                var x = 0.0;
                var y = 0.0;
                var z = 0.0;
                for (var row = 0; row < subZ; row++) {
                    for (var col = 0; col < subX; col++) {
                        x = col * width / subX - width * 0.5;
                        z = row * height / subZ - height * 0.5;
                        var heightmapX = ((x + width * 0.5) / width * (bufferWidth - 1)) | 0;
                        var heightmapY = (bufferHeight - 1) - ((z + height * 0.5) / height * (bufferHeight - 1)) | 0;
                        var pos = (heightmapX + heightmapY * bufferWidth) * 4;
                        var gradient = (buffer[pos] * filter.r + buffer[pos + 1] * filter.g + buffer[pos + 2] * filter.b) / 255.0;
                        y = minHeight + (maxHeight - minHeight) * gradient;
                        var idx = (row * subX + col) * 3;
                        data[idx] = x + offsetX;
                        data[idx + 1] = y;
                        data[idx + 2] = z + offsetZ;
                    }
                }
                // callback function if any
                if (onReady) {
                    onReady(data, subX, subZ);
                }
            };
            BABYLON.Tools.LoadImage(heightmapURL, onload, function () { }, scene.database);
        };
        /**
         * Static : Updates the passed arrays with UVs values to fit the whole map with subX points along its width and subZ points along its height.
         * The passed array must be the right size : subX x subZ x 2.
         */
        DynamicTerrain.CreateUVMapToRef = function (subX, subZ, mapUVs) {
            for (var h = 0; h < subZ; h++) {
                for (var w = 0; w < subX; w++) {
                    mapUVs[(h * subX + w) * 2] = w / subX;
                    mapUVs[(h * subX + w) * 2 + 1] = h / subZ;
                }
            }
        };
        /**
         * Static : Returns a new UV array with values to fit the whole map with subX points along its width and subZ points along its height.
         */
        DynamicTerrain.CreateUVMap = function (subX, subZ) {
            var mapUVs = new Float32Array(subX * subZ * 2);
            DynamicTerrain.CreateUVMapToRef(subX, subZ, mapUVs);
            return mapUVs;
        };
        /**
         * Computes and sets the terrain UV map with values to fit the whole map.
         * Returns the terrain.
         */
        DynamicTerrain.prototype.createUVMap = function () {
            this.mapUVs = DynamicTerrain.CreateUVMap(this._mapSubX, this._mapSubZ);
            return this;
        };
        Object.defineProperty(DynamicTerrain.prototype, "refreshEveryFrame", {
            // Getters / Setters
            /**
             * boolean : if the terrain must be recomputed every frame.
             */
            get: function () {
                return this._refreshEveryFrame;
            },
            set: function (val) {
                this._refreshEveryFrame = val;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "mesh", {
            /**
             * Mesh : the logical terrain underlying mesh
             */
            get: function () {
                return this._terrain;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "camera", {
            /**
             * The camera the terrain is linked to
             */
            get: function () {
                return this._terrainCamera;
            },
            set: function (val) {
                this._terrainCamera = val;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "subToleranceX", {
            /**
             * Number of cells flought over by the cam on the X axis before the terrain is updated.
             * Integer greater or equal to 1.
             */
            get: function () {
                return this._subToleranceX;
            },
            set: function (val) {
                this._subToleranceX = (val > 0) ? val : 1;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "subToleranceZ", {
            /**
             * Number of cells flought over by the cam on the Z axis before the terrain is updated.
             * Integer greater or equal to 1. Default 1.
             */
            get: function () {
                return this._subToleranceZ;
            },
            set: function (val) {
                this._subToleranceZ = (val > 0) ? val : 1;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "initialLOD", {
            /**
             * Initial LOD factor value.
             * Integer greater or equal to 1. Default 1.
             */
            get: function () {
                return this._initialLOD;
            },
            set: function (val) {
                this._initialLOD = (val > 0) ? val : 1;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "LODValue", {
            /**
            * Current LOD factor value : the lower factor in the terrain.
            * The LOD value is the sum of the initialLOD and the current cameraLODCorrection.
            * Integer greater or equal to 1. Default 1.
            */
            get: function () {
                return this._LODValue;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "cameraLODCorrection", {
            /**
             * Camera LOD correction : the factor to add to the initial LOD according to the camera position, movement, etc.
             * Positive integer (default 0)
             */
            get: function () {
                return this._cameraLODCorrection;
            },
            set: function (val) {
                this._cameraLODCorrection = (val >= 0) ? val : 0;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "averageSubSizeX", {
            /**
             * Average map and terrain subdivision size on X axis.
             * Returns a float.
             */
            get: function () {
                return this._averageSubSizeX;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "averageSubSizeZ", {
            /**
             * Average map and terrain subdivision size on Z axis.
             * Returns a float.
             */
            get: function () {
                return this._averageSubSizeZ;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "terrainSizeX", {
            /**
             * Current terrain size on the X axis.
             * Returns a float.
             */
            get: function () {
                return this._terrainSizeX;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "terrainHalfSizeX", {
            /**
             * Current terrain half size on the X axis.
             * Returns a float.
             */
            get: function () {
                return this._terrainHalfSizeX;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "terrainSizeZ", {
            /**
             * Current terrain size on the Z axis.
             * Returns a float.
             */
            get: function () {
                return this._terrainSizeZ;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "terrainHalfSizeZ", {
            /**
             * Current terrain half size on the Z axis.
             * Returns a float.
             */
            get: function () {
                return this._terrainHalfSizeZ;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "centerLocal", {
            /**
             * Current position of terrain center in its local space.
             * Returns a Vector3.
             */
            get: function () {
                return this._centerLocal;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "centerWorld", {
            /**
             * Current position of terrain center in the World space.
             * Returns a Vector3.
             */
            get: function () {
                return this._centerWorld;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "LODLimits", {
            /**
             * The array of the limit values to change the LOD factor.
             * Returns an array of integers or an empty array.
             * This array is always sorted in the descending order once set.
             */
            get: function () {
                return this._LODLimits;
            },
            set: function (ar) {
                ar.sort(function (a, b) {
                    return b - a;
                });
                this._LODLimits = ar;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "mapData", {
            /**
             * The data of the map.
             * A flat array (Float32Array recommeded) of successive 3D float coordinates (x, y, z).
             * This property can be set only if a mapData array was passed at construction time.
             */
            get: function () {
                return this._mapData;
            },
            set: function (val) {
                this._mapData = val;
                this._datamap = true;
                this._mapSizeX = Math.abs(this._mapData[(this._mapSubX - 1) * 3] - this._mapData[0]);
                this._mapSizeZ = Math.abs(this._mapData[(this._mapSubZ - 1) * this._mapSubX * 3 + 2] - this._mapData[2]);
                this._averageSubSizeX = this._mapSizeX / this._mapSubX;
                this._averageSubSizeZ = this._mapSizeZ / this._mapSubZ;
                if (this._precomputeNormalsFromMap) {
                    this.computeNormalsFromMap();
                }
                this.update(true);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "mapSubX", {
            /**
             * The number of points on the map width.
             * Positive Integer.
             */
            get: function () {
                return this._mapSubX;
            },
            set: function (val) {
                this._mapSubX = val;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "mapSubZ", {
            /**
             * The number of points on the map height .
             * Positive Integer.
             */
            get: function () {
                return this._mapSubZ;
            },
            set: function (val) {
                this._mapSubZ = val;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "mapColors", {
            /**
             * The map of colors.
             * A flat array of successive floats between 0 and 1 as r,g,b values.
             * This property can be set only if a mapColors array was passed at construction time.
             */
            get: function () {
                return this._mapColors;
            },
            set: function (val) {
                this._colormap = true;
                this._mapColors = val;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "mapUVs", {
            /**
             * The map of UVs.
             * A flat array of successive floats between 0 and 1 as (u, v) values.
             * This property can be set only if a mapUVs array was passed at construction time.
             */
            get: function () {
                return this._mapUVs;
            },
            set: function (val) {
                this._uvmap = true;
                this._mapUVs = val;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "mapNormals", {
            /**
             * The map of normals.
             * A flat array of successive floats as normal vector coordinates (x, y, z) on each map point.
             */
            get: function () {
                return this._mapNormals;
            },
            set: function (val) {
                this._mapNormals = val;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "computeNormals", {
            /**
             * Boolean : must the normals be recomputed on each terrain update (default : false).
             * By default, all the map normals are pre-computed on terrain creation.
             */
            get: function () {
                return this._computeNormals;
            },
            set: function (val) {
                this._computeNormals = val;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "useCustomVertexFunction", {
            /**
             * Boolean : will the custom function updateVertex() be called on each terrain update ?
             * Default false
             */
            get: function () {
                return this._useCustomVertexFunction;
            },
            set: function (val) {
                this._useCustomVertexFunction = val;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "isAlwaysVisible", {
            /**
             * Boolean : is the terrain always directly selected for rendering ?
             */
            get: function () {
                return this._isAlwaysVisible;
            },
            set: function (val) {
                this.mesh.alwaysSelectAsActiveMesh = val;
                this._isAlwaysVisible = val;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(DynamicTerrain.prototype, "precomputeNormalsFromMap", {
            /**
             * Boolean : when assigning a new data map to the existing, shall the normals be automatically precomputed once ?
             * Default false.
             */
            get: function () {
                return this._precomputeNormalsFromMap;
            },
            set: function (val) {
                this._precomputeNormalsFromMap = val;
            },
            enumerable: true,
            configurable: true
        });
        // ===============================================================
        // User custom functions.
        // These following can be overwritten bu the user to fit his needs.
        /**
         * Custom function called for each terrain vertex and passed the :
         * - current vertex {position: Vector3, uvs: Vector2, color: Color4, lodX: integer, lodZ: integer, worldPosition: Vector3, mapIndex: integer}
         * - i : the vertex index on the terrain x axis
         * - j : the vertex index on the terrain x axis
         * This function is called only if the property useCustomVertexFunction is set to true.
         */
        DynamicTerrain.prototype.updateVertex = function (vertex, i, j) {
            return;
        };
        /**
         * Custom function called each frame and passed the terrain camera reference.
         * This should return a positive integer or zero.
         * Returns zero by default.
         */
        DynamicTerrain.prototype.updateCameraLOD = function (terrainCamera) {
            // LOD value increases with camera altitude
            var camLOD = 0;
            return camLOD;
        };
        /**
         * Custom function called before each terrain update.
         * The value of reference is passed.
         * Does nothing by default.
         */
        DynamicTerrain.prototype.beforeUpdate = function (refreshEveryFrame) {
            return;
        };
        /**
         * Custom function called after each terrain update.
         * The value of refreshEveryFrame is passed.
         * Does nothing by default.
         */
        DynamicTerrain.prototype.afterUpdate = function (refreshEveryFrame) {
            return;
        };
        return DynamicTerrain;
    }());
    // tmp vectors
    DynamicTerrain._v1 = BABYLON.Vector3.Zero();
    DynamicTerrain._v2 = BABYLON.Vector3.Zero();
    DynamicTerrain._v3 = BABYLON.Vector3.Zero();
    DynamicTerrain._v4 = BABYLON.Vector3.Zero();
    DynamicTerrain._vAvB = BABYLON.Vector3.Zero();
    DynamicTerrain._vAvC = BABYLON.Vector3.Zero();
    DynamicTerrain._norm = BABYLON.Vector3.Zero();
    BABYLON.DynamicTerrain = DynamicTerrain;
})(BABYLON || (BABYLON = {}));
//# sourceMappingURL=babylon.dynamicTerrain.js.map