//------------------------------------------------------
// SHADERS
//------------------------------------------------------

const vertexShaderSource = `
    attribute vec4 aPosition;
    attribute vec2 aTextureCoord; // Attribute for texture coordinates
    uniform mat4 uModelMatrix;
    uniform mat4 uViewMatrix;
    uniform mat4 uProjectionMatrix;
    varying vec2 vTextureCoord; // Pass texture coordinates to the fragment shader

    void main() {
        gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * aPosition;
        vTextureCoord = aTextureCoord; // Pass texture coordinates to the fragment shader
    }
`;

const fragmentShaderSource = `
    precision mediump float;
    uniform sampler2D uTexture;
    uniform sampler2D uNormalMap;
    varying vec2 vTextureCoord;
    uniform mat4 uNormalMatrix;
    uniform vec3 uLightDirection; // Now in view space

    void main() {
        vec3 normalMap = texture2D(uNormalMap, vTextureCoord).xyz * 2.0 - 1.0;
        vec3 normal = normalize(vec3(uNormalMatrix * vec4(normalMap, 0.0)));

        // Transform light direction to view space
        vec3 viewSpaceLightDir = normalize(vec3(uNormalMatrix * vec4(uLightDirection, 0.0)));

        float lightIntensity = max(dot(normal, viewSpaceLightDir), 0.0);

        vec4 texColor = texture2D(uTexture, vTextureCoord);
        vec3 finalColor = texColor.rgb * lightIntensity;

        gl_FragColor = vec4(finalColor, texColor.a);
    }
`;

//------------------------------------------------------
// SHADER PROGRAM
//------------------------------------------------------

function compileAndAttachShader(gl, program, type, source) {
    // Create a new shader of the specified type
    const shader = gl.createShader(type);

    // Set the shader source code and compile it
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    // Attach the compiled shader to the program
    gl.attachShader(program, shader);

    // Check if shader compilation was successful
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(`Shader compilation failed: ${type}`, gl.getShaderInfoLog(shader));
    }
}

function createShaderProgram(gl, vSource, fSource) {    
    const program = gl.createProgram();

    // Compile and attach the shaders to the program
    compileAndAttachShader(gl, program, gl.VERTEX_SHADER, vSource);
    compileAndAttachShader(gl, program, gl.FRAGMENT_SHADER, fSource);

    // Link the shader program
    gl.linkProgram(program);

    // Check if shader program linking was successful
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Unable to initialize the shader program:', gl.getProgramInfoLog(program));
    }

    return program;
}

// Create shader program
const canvas = document.querySelector('#c');
const gl = canvas.getContext('webgl');
const shaderProgram = createShaderProgram(gl, vertexShaderSource, fragmentShaderSource);

// Establish vertex buffer
const vertexBuffer = gl.createBuffer();

// Get the uniform locations for model, view, and projection matrices in the shader program
const uModelMatrixLocation = gl.getUniformLocation(shaderProgram, 'uModelMatrix');
const uViewMatrixLocation = gl.getUniformLocation(shaderProgram, 'uViewMatrix');
const uProjectionMatrixLocation = gl.getUniformLocation(shaderProgram, 'uProjectionMatrix');

// Create matrices to hold model, view, and projection transformations
let modelMatrix = mat4.create();
let viewMatrix = mat4.create();
let projectionMatrix = mat4.create();

// Get the attribute location for the position attribute in the shader program
const positionAttributeLocation = gl.getAttribLocation(shaderProgram, "aPosition");

// Get the uniform location for the color variable in the shader program
const uColorLocation = gl.getUniformLocation(shaderProgram, 'uColor');

gl.useProgram(shaderProgram);
gl.enableVertexAttribArray(positionAttributeLocation);

// Define how the position data is stored in the buffer
gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

// Set the color uniform in the shader program 
gl.uniform4f(uColorLocation, 0.04, 0.6, 1.0, 1.0); 

// Set the viewport to match the size of the canvas
gl.viewport(0, 0, canvas.width, canvas.height);

// Enable depth testing to ensure proper rendering of overlapping objects
gl.enable(gl.DEPTH_TEST);

//------------------------------------------------------
// STATE
//------------------------------------------------------

const state = {
    canvasSize: 2,
    xRotationSpeed: 0,
    yRotationSpeed: 0,
    zRotationSpeed: 0,
    xRotationAngle: 0,
    yRotationAngle: 0,
    zRotationAngle: 0,
    mouseDown: false, 
    lastMouseX: null, 
    lastMouseY: null,
    dragSensitivity: 0.01, 
    canvasRotationMatrix: mat4.create(),
    canvasScale: 1.0
}

//------------------------------------------------------
// TEXTURE
//------------------------------------------------------

// Load and Bind the Texture
const texture = gl.createTexture();
const image = new Image();
image.src = 'texture.png';

image.onload = () => {
    // Bind the texture to the 2D texture target
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Specify the 2D texture image, format, and type
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    // Generate mipmaps for the texture
    gl.generateMipmap(gl.TEXTURE_2D);

    // Unbind the texture to avoid accidental modification in subsequent calls
    gl.bindTexture(gl.TEXTURE_2D, null);
};

// Set Uniform for the Texture
const uTextureLocation = gl.getUniformLocation(shaderProgram, 'uTexture');
gl.uniform1i(uTextureLocation, 0); 

// Create a buffer to store texture coordinates for associating textures with vertices
const textureCoordBuffer = gl.createBuffer();

//------------------------------------------------------
// NORMAL MAP
//------------------------------------------------------

const normalMap = gl.createTexture();
const normalMapImage = new Image();
normalMapImage.src = 'normalMap.png';

normalMapImage.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, normalMap);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, normalMapImage);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
};

const uNormalMapLocation = gl.getUniformLocation(shaderProgram, 'uNormalMap');
gl.uniform1i(uNormalMapLocation, 1); // Use texture unit 1 for the normal map

//------------------------------------------------------
// NORMAL MATRIX
//------------------------------------------------------

// Get the uniform location for the normal matrix in the shader program
const uNormalMatrixLocation = gl.getUniformLocation(shaderProgram, 'uNormalMatrix');

// Calculate and set the normal matrix
const normalMatrix = mat4.create();
mat4.invert(normalMatrix, modelMatrix);
mat4.transpose(normalMatrix, normalMatrix);
gl.uniformMatrix4fv(uNormalMatrixLocation, false, normalMatrix);

//------------------------------------------------------
// LIGHTING
//------------------------------------------------------

const uLightDirectionLocation = gl.getUniformLocation(shaderProgram, 'uLightDirection');
gl.uniform3fv(uLightDirectionLocation, [0.5, -1.0, 1.0]);

//------------------------------------------------------
// COORDINATES AND VERTICES
//------------------------------------------------------

function createCubeTextureCoordinates() {
    return [
        // Front face
        0.0, 0.0,
        1.0, 0.0,
        1.0, 1.0,
        0.0, 0.0,
        1.0, 1.0,
        0.0, 1.0,

        // Back face
        0.0, 0.0,
        1.0, 0.0,
        1.0, 1.0,
        0.0, 0.0,
        1.0, 1.0,
        0.0, 1.0,

        // Top face
        0.0, 0.0,
        1.0, 0.0,
        1.0, 1.0,
        0.0, 0.0,
        1.0, 1.0,
        0.0, 1.0,

        // Bottom face
        0.0, 0.0,
        1.0, 0.0,
        1.0, 1.0,
        0.0, 0.0,
        1.0, 1.0,
        0.0, 1.0,

        // Right face
        0.0, 0.0,
        1.0, 0.0,
        1.0, 1.0,
        0.0, 0.0,
        1.0, 1.0,
        0.0, 1.0,

        // Left face
        0.0, 0.0,
        1.0, 0.0,
        1.0, 1.0,
        0.0, 0.0,
        1.0, 1.0,
        0.0, 1.0,
    ];
}

function createCubeVertices(x, y, z, size) {
    const d = size / 2;
    return [
        // Front face
        x-d, y-d, z+d,
        x+d, y-d, z+d,
        x+d, y+d, z+d,
        x-d, y-d, z+d,
        x+d, y+d, z+d,
        x-d, y+d, z+d,

        // Back face
        x-d, y-d, z-d,
        x+d, y-d, z-d,
        x+d, y+d, z-d,
        x-d, y-d, z-d,
        x+d, y+d, z-d,
        x-d, y+d, z-d,

        // Top face
        x-d, y+d, z+d,
        x+d, y+d, z+d,
        x+d, y+d, z-d,
        x-d, y+d, z+d,
        x+d, y+d, z-d,
        x-d, y+d, z-d,

        // Bottom face
        x-d, y-d, z+d,
        x+d, y-d, z+d,
        x+d, y-d, z-d,
        x-d, y-d, z+d,
        x+d, y-d, z-d,
        x-d, y-d, z-d,

        // Right face
        x+d, y-d, z+d,
        x+d, y-d, z-d,
        x+d, y+d, z-d,
        x+d, y-d, z+d,
        x+d, y+d, z-d,
        x+d, y+d, z+d,

        // Left face
        x-d, y-d, z+d,
        x-d, y-d, z-d,
        x-d, y+d, z-d,
        x-d, y-d, z+d,
        x-d, y+d, z-d,
        x-d, y+d, z+d
    ];
}

//------------------------------------------------------
// DRAWING FUNCTIONS
//------------------------------------------------------

function drawCube(vertices) {
    // Create texture coordinates for the cube
    const textureCoordinates = createCubeTextureCoordinates();

    // Bind the normal map to the texture unit
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, normalMap);

    // Bind the texture to the 2D texture target in WebGL
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Bind the vertex buffer and populate it with the provided vertices
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    // Enable the position attribute
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.vertexAttribPointer(positionAttributeLocation, 3, gl.FLOAT, false, 0, 0);

    // Enable the texture coordinate attribute
    const textureCoordAttributeLocation = gl.getAttribLocation(shaderProgram, "aTextureCoord");
    gl.enableVertexAttribArray(textureCoordAttributeLocation);

    // Bind the buffer for storing texture coordinates and populate it with the provided data
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);

    // Define how the texture coordinates are accessed and interpreted by the shader
    gl.vertexAttribPointer(textureCoordAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    // Calculate and set the normal matrix
    const normalMatrix = mat4.create();
    mat4.invert(normalMatrix, modelMatrix);
    mat4.transpose(normalMatrix, normalMatrix);
    const uNormalMatrixLocation = gl.getUniformLocation(shaderProgram, 'uNormalMatrix');
    gl.uniformMatrix4fv(uNormalMatrixLocation, false, normalMatrix);

    // Extract the coordinates of the front bottom left vertex
    const x1 = Math.round(vertices[0] * 10000) / 10000;
    const y1 = Math.round(vertices[1] * 10000) / 10000;
    const z1 = Math.round(vertices[2] * 10000) / 10000;

    // Extract the coordinates of the back top right vertex
    const x2 = Math.round(vertices[24] * 10000) / 10000;
    const y2 = Math.round(vertices[25] * 10000) / 10000;
    const z2 = Math.round(vertices[26] * 10000) / 10000;

    // Calculate the center of the cube
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;
    const centerZ = (z1 + z2) / 2;

    // Set the matrix to the identity matrix
    mat4.identity(modelMatrix);

    // Scale the cube based on the canvas scale factor
    mat4.scale(modelMatrix, modelMatrix, [state.canvasScale, state.canvasScale, state.canvasScale]);

    // Apply the rotation matrix representing user interactions
    mat4.multiply(modelMatrix, state.canvasRotationMatrix, modelMatrix);

    // Translate the cube to its center position in the scene
    mat4.translate(modelMatrix, modelMatrix, [centerX, centerY, centerZ]);

    // Apply rotations
    mat4.rotateX(modelMatrix, modelMatrix, state.xRotationAngle);
    mat4.rotateY(modelMatrix, modelMatrix, state.yRotationAngle);
    mat4.rotateZ(modelMatrix, modelMatrix, state.zRotationAngle);

    // Translate the cube back to its original position
    mat4.translate(modelMatrix, modelMatrix, [-centerX, -centerY, -centerZ]);

    // Send matrices to the GPU
    gl.uniformMatrix4fv(uModelMatrixLocation, false, modelMatrix);
    gl.uniformMatrix4fv(uViewMatrixLocation, false, viewMatrix);
    gl.uniformMatrix4fv(uProjectionMatrixLocation, false, projectionMatrix);

    // Draw the cube as triangles
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 3);
}

function drawCarpet(x, y, size, iterations) {

    // Calculate the size of each surrounding cube
    const newSize = size / 3;

    // Iterate over the 3x3 grid of surrounding cubes
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {

            // Calculate the position of the new cube
            const newX = x + i * newSize;
            const newY = y + j * newSize;
            
            // Check if the new cube is at the center
            if (i === 1 && j === 1) {
                // Draw the center cube
                const vertices = createCubeVertices(newX + newSize/2, newY + newSize/2, newSize/2, newSize);
                drawCube(vertices);
            }
            // If not in the center and iterations remain
            else if (iterations > 1) {
                // Continue drawing carpet
                drawCarpet(newX, newY, newSize, iterations - 1);
            }
        }
    }
}

function animate() {
    // Clear the canvas
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Update the rotation angles based on the rotation speeds
    state.xRotationAngle += (state.xRotationSpeed / 200);
    state.yRotationAngle += (state.yRotationSpeed / 200);
    state.zRotationAngle += (state.zRotationSpeed / 200);

    drawCarpet(-1, -1, state.canvasSize, slider.value);
    
    // Request next frame
    requestAnimationFrame(animate);
}

function redraw() {
    // Update the rotation speeds from the sliders
    state.xRotationSpeed = parseFloat(document.getElementById('xRotationSlider').value);
    state.yRotationSpeed = parseFloat(document.getElementById('yRotationSlider').value);
    state.zRotationSpeed = parseFloat(document.getElementById('zRotationSlider').value);
}

//------------------------------------------------------
// EVENT HANDLING
//------------------------------------------------------

let slider = document.getElementById('stepSlider');
let xSlider = document.getElementById('xRotationSlider');
let ySlider = document.getElementById('yRotationSlider');
let zSlider = document.getElementById('zRotationSlider');
let container = document.getElementById('container');

function onSliderClick(event) {
    event.stopPropagation();
    document.getElementById('numSteps').innerHTML = slider.value;

    // Clear the canvas
    gl.clearColor(0.0, 0.0, 0.0, 1.0); 
    gl.clear(gl.COLOR_BUFFER_BIT);
}

function handleMouseDown(event) {
    state.mouseDown = true;
    state.lastMouseX = event.clientX;
    state.lastMouseY = event.clientY;
}

function handleMouseUp(event) {
    state.mouseDown = false;
}

function handleMouseMove(event) {
    if (!state.mouseDown) {
        return;
    }

    // Get the current mouse coordinates
    const newX = event.clientX;
    const newY = event.clientY;

    // Calculate the change in mouse coordinates
    const deltaX = newX - state.lastMouseX;
    const deltaY = newY - state.lastMouseY;

    // Create a new rotation matrix for the mouse movement
    const newRotationMatrix = mat4.create();
    mat4.identity(newRotationMatrix);

    // Apply rotation
    mat4.rotate(newRotationMatrix, newRotationMatrix, state.dragSensitivity * deltaX, [0, 1, 0]); 
    mat4.rotate(newRotationMatrix, newRotationMatrix, state.dragSensitivity * deltaY, [1, 0, 0]); 

    // Multiply the new rotation matrix with the existing canvas rotation matrix
    mat4.multiply(state.canvasRotationMatrix, newRotationMatrix, state.canvasRotationMatrix);

    // Update the last mouse coordinates
    state.lastMouseX = newX;
    state.lastMouseY = newY;
}

function onCanvasWheel(event) {
    // Prevent the default scrolling behavior
    event.preventDefault();  

    const zoomSensitivity = 0.1;  

    // Update the canvas's scale based on the scroll direction
    if (event.deltaY > 0) {
        // Zoom out
        state.canvasScale -= zoomSensitivity;
    } else if (event.deltaY < 0) {
        // Zoom in
        state.canvasScale += zoomSensitivity;
    }

    // Restrict the zoom level to avoid scaling too much or too little
    state.canvasScale = Math.min(Math.max(state.canvasScale, 0.1), 10.0);
}

xSlider.addEventListener('input', function(){
    document.getElementById('xRotationValue').innerHTML = xSlider.value;
    redraw();
});

ySlider.addEventListener('input', function(){
    document.getElementById('yRotationValue').innerHTML = ySlider.value;
    redraw();
});

zSlider.addEventListener('input', function(){
    document.getElementById('zRotationValue').innerHTML = zSlider.value;
    redraw();
});

slider.addEventListener('click', onSliderClick);

container.addEventListener('mousedown', handleMouseDown, false);
container.addEventListener('mouseup', handleMouseUp, false);
container.addEventListener('mouseout', handleMouseUp, false);
container.addEventListener('mousemove', handleMouseMove, false);
container.addEventListener('wheel', onCanvasWheel);

//------------------------------------------------------
// START ANIMATION
//------------------------------------------------------

animate();
