/*
 * Mark Schloeman - raytrace.js - 2/15/2021
 * I'm making this script to practice the basics of raytracing.
 * I just finished reading the Ray Tracing section of
 * Graphics Programming From Scratch (https://gabrielgambetta.com/computer-graphics-from-scratch/)
 * and I want to write my own version so I can review the concepts
 * and also make it in a way that I am more comfortable extending.
 */

/* Ways I have extended the Ray Tracer from the book:

    When checking for shadows it now checks for objects that cast shadows on
    adjacent tiles first - reduced time by roughly 10 ms on average.

    Implemented subsampling to halve the render time.

    TODO:

        Play around with other data structures to represent the spheres
            - Some sort of tree?
 */

// Globals that don't feel right inside of the Scene object
const EPSILON = 0.001;
const SPHERE_EDGE_THRESHOLD = 2.5;

//Linear Algebra and Math functions
function Midpoint2(v1, v2) {
  return ScalarDivide(Add(v1, v2), 2);
}

function Midpoint(pointArray) {
  let center = pointArray.reduce((a, b) => Add(a, b));
  center = ScalarDivide(center, pointArray.length);
  return center;
}

// Vector on Vector action
function CrossProduct(v1, v2) {
  return [
    v1[1] * v2[2] - v1[2] * v2[1],
    v1[2] * v2[0] - v1[0] * v2[2],
    v1[0] * v2[1] - v1[1] * v2[0],
  ];
}

function DotProduct(v1, v2) {
  return v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
}

function Add(v1, v2) {
  return [v1[0] + v2[0], v1[1] + v2[1], v1[2] + v2[2]];
}

function Subtract(v1, v2) {
  return [v1[0] - v2[0], v1[1] - v2[1], v1[2] - v2[2]];
}

function Length(v) {
  return Math.sqrt(DotProduct(v, v));
}

function ScalarMultiply(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function ScalarDivide(v, s) {
  return [v[0] / s, v[1] / s, v[2] / s];
}

function MatrixMultiply(m, v) {
  let result = [0, 0, 0];

  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      result[i] += v[j] * m[i][j];
    }
  }
  return result;
}

function DegreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function XRotationMatrix(degrees) {
  const radians = DegreesToRadians(degrees);
  const cosValue = Math.cos(radians);
  const sinValue = Math.sin(radians);
  return [
    [1, 0, 0],
    [0, cosValue, -sinValue],
    [0, sinValue, cosValue],
  ];
}

function YRotationMatrix(degrees) {
  const radians = DegreesToRadians(degrees);
  const cosValue = Math.cos(radians);
  const sinValue = Math.sin(radians);
  return [
    [cosValue, 0, sinValue],
    [0, 1, 0],
    [-sinValue, 0, cosValue],
  ];
}

function ZRotationMatrix(degrees) {
  const radians = DegreesToRadians(degrees);
  const cosValue = Math.cos(radians);
  const sinValue = Math.sin(radians);
  return [
    [cosValue, -sinValue, 0],
    [sinValue, cosValue, 0],
    [0, 0, 1],
  ];
}

function RotationMatrix(x, y, z) {
  return [XRotationMatrix(x), YRotationMatrix(y), ZRotationMatrix(z)];
}

function RotateVector(rotationMatrix, direction) {
  for (let i = 0; i < rotationMatrix.length; i++) {
    direction = MatrixMultiply(rotationMatrix[i], direction);
  }
  return direction;
}

function Clamp(min, max, value) {
  return Math.min(Math.max(min, value), max);
}

// Colors
function BrightenColor(color, i) {
  return [
    Clamp(0, 255, color[0] * i),
    Clamp(0, 255, color[1] * i),
    Clamp(0, 255, color[2] * i),
  ];
}

// Scene objects
function Sphere(center, radius, color, specular, reflection, opacity) {
  if (opacity === null) {
    opacity = 1;
  }
  return {
    center,
    radius,
    color,
    specular,
    reflection,
    opacity,
    bounding: false,
    isBound: false,
  };
}

function BoundingSphere(center, radius, nestedSpheres) {
  return {
    center,
    radius,
    nestedSpheres,
    bounding: true,
  };
}

function Light(type, intensity, position) {
  return {
    type,
    intensity,
    position,
  };
}
// Enums
Light.ambient = 0;
Light.point = 1;
Light.directional = 2;

// Ray Tracer functions
function ReflectRay(reflect, normal) {
  return Subtract(
    ScalarMultiply(normal, 2 * DotProduct(normal, reflect)),
    reflect
  );
}

function IntersectRaySphere(origin, direction, sphere, a) {
  let oc = Subtract(origin, sphere.center);

  //let a = DotProduct(direction, direction); - taking this as an argument now b/c it doesn't change
  let b = DotProduct(oc, direction) * 2;
  let c = DotProduct(oc, oc) - sphere.radius * sphere.radius;

  let discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return [Infinity, Infinity];
  }

  let t1 = (-b + Math.sqrt(discriminant)) / (2 * a);
  let t2 = (-b - Math.sqrt(discriminant)) / (2 * a);
  return [t1, t2];
}

// This function is currently only used when calculating intersections from light rays
// so it has some optimizations designed for lights.
function AnyIntersection(origin, direction, minT, maxT, lastBlockerIndex) {
  const dDotd = DotProduct(direction, direction);
  // First check if the object that intersected with the previous ray blocks this one
  if (lastBlockerIndex !== null) {
    let ts = IntersectRaySphere(
      origin,
      direction,
      Scene.spheres[lastBlockerIndex],
      dDotd
    );
    if ((ts[0] > minT && ts[0] < maxT) || (ts[1] > minT && ts[1] < maxT)) {
      return lastBlockerIndex;
    }
  }
  for (let i = 0; i < Scene.spheres.length; i++) {
    let ts = IntersectRaySphere(origin, direction, Scene.spheres[i], dDotd);
    if ((ts[0] > minT && ts[0] < maxT) || (ts[1] > minT && ts[1] < maxT)) {
      return i;
    }
  }
  return null;
}

function OldClosestIntersection(origin, direction, minT, maxT) {
  let closestT = Infinity;
  let closestSphere = null;

  const dDotd = DotProduct(direction, direction);
  for (let i = 0; i < Scene.spheres.length; i++) {
    let sphere = Scene.spheres[i];
    let ts = IntersectRaySphere(origin, direction, sphere, dDotd);
    if (ts[0] < closestT && ts[0] > minT && ts[0] < maxT) {
      closestT = ts[0];
      closestSphere = sphere;
    }
    if (ts[1] < closestT && ts[1] > minT && ts[1] < maxT) {
      closestT = ts[1];
      closestSphere = sphere;
    }
  }
  return [closestT, closestSphere];
}

function ClosestIntersection(
  origin,
  direction,
  minT,
  maxT,
  spheres,
  closestSphere
) {
  let closestT = maxT;
  if (!closestSphere) {
    closestSphere = null;
  }

  const dDotd = DotProduct(direction, direction);
  for (let i = 0; i < spheres.length; i++) {
    let sphere = spheres[i];
    let ts = IntersectRaySphere(origin, direction, sphere, dDotd);

    // Highlight bounding spheres - highlights will show through other spheres
    // if (
    //   sphere.bounding &&
    //   Scene.outlineBoundingSpheres &&
    //   Math.abs(ts[0] - ts[1]) < SPHERE_EDGE_THRESHOLD
    // ) {
    //   return [ts[0], sphere];
    // }

    if (ts[0] < closestT && ts[0] > minT && ts[0] < maxT) {
      if (sphere.bounding) {
        if (
          Scene.outlineBoundingSpheres &&
          Math.abs(ts[0] - ts[1]) < SPHERE_EDGE_THRESHOLD
        ) {
          closestT = ts[0]
          closestSphere = sphere;
        } else {
          // If intersects bounding sphere
          [closestT, closestSphere] = ClosestIntersection(
            origin,
            direction,
            minT,
            closestT,
            sphere.nestedSpheres,
            closestSphere
          );
        }
      } else {
        closestT = ts[0];
        closestSphere = sphere;
      }
    }

    if (ts[1] < closestT && ts[1] > minT && ts[1] < maxT) {
      if (sphere.bounding) {
        if (
          Scene.outlineBoundingSpheres &&
          Math.abs(ts[0] - ts[1]) < SPHERE_EDGE_THRESHOLD
        ) {
          closestT = ts[1]
          closestSphere = sphere;
        } else {
          // If intersects bounding sphere
          [closestT, closestSphere] = ClosestIntersection(
            origin,
            direction,
            minT,
            closestT,
            sphere.nestedSpheres,
            closestSphere
          );
        }
      } else {
        closestT = ts[1];
        closestSphere = sphere;
      }
    }
  }
  return [closestT, closestSphere];
}

function ComputeLighting(point, normal, vector, specular) {
  let intensity = 0.0;

  for (let i = 0; i < Scene.lights.length; i++) {
    let light = Scene.lights[i];
    if (light.type == Light.ambient) {
      intensity += light.intensity;
    } else {
      let lightRay;

      if (light.type == Light.point) {
        lightRay = Subtract(light.position, point);
      } else {
        lightRay = light.position;
      }

      const blockedBy = AnyIntersection(
        point,
        lightRay,
        EPSILON,
        1.0,
        Scene.previousPointBlockedBy[i]
      );
      Scene.previousPointBlockedBy[i] = blockedBy;
      if (blockedBy === null) {
        let normalDotLightRay = DotProduct(normal, lightRay);
        if (normalDotLightRay > 0) {
          intensity +=
            (light.intensity * normalDotLightRay) /
            (Length(normal) * Length(lightRay));
        }

        if (specular != -1) {
          let reflection = ReflectRay(lightRay, normal);
          let reflectionDotVector = DotProduct(reflection, vector);
          if (reflectionDotVector > 0) {
            intensity +=
              light.intensity *
              Math.pow(
                reflectionDotVector / (Length(reflection) * Length(vector)),
                specular
              );
          }
        }
      }
    }
  }
  return intensity;
}

function TraceRay(origin, direction, minT, maxT, recursionDepth) {
  let intersection = ClosestIntersection(
    origin,
    direction,
    minT,
    maxT,
    Scene.checkSpheres
  );
  let t = intersection[0];
  let object = intersection[1];

  if (object === null) {
    return Scene.getBackgroundColor(origin, direction);
  }

  if (object.bounding) {
    // This should only over happen if Scene.outlineBoundingSphere is true
    return Scene.highlightColor;
  }

  let point = Add(origin, ScalarMultiply(direction, t));
  let normal = Subtract(point, object.center);
  normal = ScalarDivide(normal, Length(normal));
  let negativeDirection = ScalarMultiply(direction, -1);
  let lighting = ComputeLighting(
    point,
    normal,
    negativeDirection,
    object.specular
  );
  let localColor = BrightenColor(object.color, lighting);

  if(object.opacity < 1 && recursionDepth > 0) {
    let transparentColor = TraceRay(point, direction, EPSILON, maxT, recursionDepth - 1);

    localColor = Add(
      BrightenColor(localColor, object.opacity),
      BrightenColor(transparentColor, 1 - object.opacity)
    );
  }


  if (object.reflective > 0 && recursionDepth > 0) {
    let reflection = ReflectRay(negativeDirection, normal);
    let reflectionColor = TraceRay(
      point,
      reflection,
      EPSILON,
      Infinity,
      recursionDepth - 1
    );
    localColor = Add(
      BrightenColor(localColor, 1 - object.reflective),
      BrightenColor(reflectionColor, object.reflective)
    );
  }

  Scene.lastHit = Scene.currentHit;
  Scene.currentHit = object;
  
  return localColor;
}

// canvas and pixel
const bytesPerPixel = 4;
const canvas = document.getElementById("canvas");
const canvasContext = canvas.getContext("2d");
let pixelBuffer = canvasContext.getImageData(
  0,
  0,
  canvas.width,
  canvas.height
);
let canvasPitch = pixelBuffer.width * bytesPerPixel; // Bytes per row

function PutPixel(x, y, color) {
  x += canvas.width / 2;
  y = canvas.height / 2 - y - 1;
  if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
    return;
  }

  let offset = bytesPerPixel * x + canvasPitch * y;
  pixelBuffer.data[offset++] = color[0];
  pixelBuffer.data[offset++] = color[1];
  pixelBuffer.data[offset++] = color[2];
  pixelBuffer.data[offset++] = 255; // I don't need to mess with opacity ATM
}

function UpdateCanvas() {
  canvasContext.putImageData(pixelBuffer, 0, 0);
}

function CanvasToViewport(xy) {
  return [
    (xy[0] * Scene.viewportSize) / canvas.width,
    (xy[1] * Scene.viewportSize) / canvas.height,
    Scene.projectionZ,
  ];
}

function RenderPixel(x, y) {
  let direction = CanvasToViewport([x, y]);
  direction = RotateVector(Scene.rotationMatrix, direction);
  let color = TraceRay(
    Scene.cameraPosition,
    direction,
    1,
    Infinity,
    Scene.reflectionLimit
  );
  return color;
}

function RenderScene() {
  for (let x = -canvas.width / 2; x < canvas.width / 2; x++) {
    for (let y = -canvas.height / 2; y < canvas.height / 2; y++) {
      let color = RenderPixel(x, y);
      PutPixel(x, y, color);
    }
    Scene.resetBlockerArray();
  }
}

function SubsampleRenderScene(ySubsampling) {
  let minY = -canvas.height / 2;
  for (let x = -canvas.width / 2; x < canvas.width / 2; x++) {
    let y = minY;
    let prevY = null;
    while (y < canvas.height / 2) {
      let color = RenderPixel(x, y);
      PutPixel(x, y, color);
      if (prevY !== null && Scene.lastHit !== Scene.currentHit) {
        for (let k = prevY + 1; k < y; k++) {
          PutPixel(x, k, RenderPixel(x, k));
        }
      } else {
        for (let k = prevY + 1; k < y; k++) {
          PutPixel(x, k, color);
        }
      }
      prevY = y;
      y += (1 + ySubsampling);
    }
    if (prevY !== (canvas.height / 2 - 1)) {
      y = (canvas.height / 2 - 1);
      color = RenderPixel(x, y);
      if (Scene.lastHit !== Scene.currentHit) {
        for (let k = prevY + 1; k < y; k++) {
          PutPixel(x, k, RenderPixel(x, k));
        }
      } else {
        for (let k = prevY + 1; k < y; k++) {
          PutPixel(x, k, color);
        }
      }
    }
    Scene.resetBlockerArray();
  }
}

function UpdateRender() {
  const start = performance.now();
  if (Scene.subsampling === 0) {
    RenderScene();
  } else {
    SubsampleRenderScene(Scene.subsampling);
  }
  UpdateCanvas();
  console.log(`Rendered in ${performance.now() - start}ms`);
}

// Scene
const Scene = (() => {
  let cameraPosition = [0, 0, -50];
  let viewportSize = 1;
  let reflectionLimit = 4;
  let projectionZ = 1;
  let rotation = [0, 0, 0];
  let rotationMatrix = RotationMatrix(rotation[0], rotation[1], rotation[2]);
  let backgroundColor = [8, 8, 16];
  let lastShadow = false;
  let subsampling = 0;
  let maxBoundingSphereDiameter = 10;
  let outlineBoundingSpheres = false;
  let highlightColor = [255, 255, 255];

  let spheres = [
    new Sphere([0, 0, 10], 1, [255, 255, 255], -1, 0, 1),
    new Sphere([-5, 0, 8], 1, [0, 0, 255], -1, 0, 0.5),
    new Sphere([-6, 0, 18], 2, [255, 0, 0], -1, 0, 1),
    new Sphere([5, 0, 8], 1, [0, 0, 0], -1, 0, 1),
    new Sphere([6, 0, 18], 2, [255, 255, 255], -1, 0, 0.5),
    
  ]

  let checkSpheres = [];

  let lights = [
    new Light(Light.ambient, 0.2),
    new Light(Light.directional, 1.0, [0, 0, -1]),
    //new Light(Light.point, 0.5, [-500, -70, -100]),
  ];

  let lastHit = null;
  let currentHit = null;
  let previousPointBlockedBy = lights.map((light) => null); // Array where indices map to lights and values are indices of the sphere that blocked the light on the last pass

  function resetBlockerArray() {
    previousPointBlockedBy = lights.map((light) => null);
  }

  function generateBoundingSpheres() {
    console.log(this.maxBoundingSphereDiameter);
    spheres.forEach((sphere) => (sphere.isBound = false));


    // I'm just gonna try getting something out there before work
    let newBoundingSpheres = []; // Temp array for new spheres so I don't alter Scene.spheres while looping
    for (let i = 0; i < spheres.length - 1; i++) {
      let sphereGroup = [spheres[i]];
      let maxSphereDistance = 0; // This is a bad name - it represents the largest distance between two spheres in a sphere group.
      for (let j = i + 1; j < spheres.length; j++) {
        let sphereB = spheres[j];
        let fitsInGroup = true;
        for (let k = 0; k < sphereGroup.length; k++) {
          let sphereA = sphereGroup[k];
          distance =
            Length(Subtract(sphereA.center, sphereB.center)) +
            sphereA.radius +
            sphereB.radius;
          if (distance > this.maxBoundingSphereDiameter) {
            fitsInGroup = false;
          } else {
            maxSphereDistance = Math.max(distance, maxSphereDistance);
          }
        }
        if (fitsInGroup) {
          sphereGroup.push(sphereB);
          //sphereB.isBound = true;
        }
      }
      if (sphereGroup.length > 1) {
        let center = Midpoint(sphereGroup.map((sphere) => sphere.center));
        let boundingSphere = new BoundingSphere(
          center,
          maxSphereDistance,
          sphereGroup
        );

        // Make sure bounding sphere is not completely inside of any other bounding sphere
        // (if it is, that means that every sphere in boundingSphere would be inside of the other bounding sphere)
        if (
          newBoundingSpheres.every((existingBoundingSphere) => {
            !(
              Length(
                Subtract(existingBoundingSphere.center, boundingSphere.center)
              ) +
                boundingSphere.radius >
              existingBoundingSphere.radius
            );
          })
        ) {
          newBoundingSpheres.push(boundingSphere);
          boundingSphere.nestedSpheres.forEach(
            (sphere) => (sphere.isBound = true)
          );
        }
      }
    }
    // Add all unbound spheres to the list of spheres that will be checked
    this.checkSpheres = newBoundingSpheres.concat(
      spheres.filter((sphere) => !sphere.isBound)
    );
  }

  function getBackgroundColor(origin, direction) {
    // This is for fun
    // Trying to make it so I can determine the background color
    // based on the vector.
    // Maybe I can try making a gradient or something?
    // let color = [
    //   (Math.cos(direction[1]) + 0.5) * 125,
    //   (Math.sin(direction[0]) + 0.5) * 125,
    //   (Math.cos(direction[1]) + 0.33) * 125,
    // ];
    // This is really neat. I'd like to pick this apart and make sense of it.
    let condA = (((Math.abs(direction[1]) * 100) % direction[0] * 100) >= (direction[2] * 10));
    let condB = (((Math.abs(direction[0] * 100)) % direction[1] * 100) <= (direction[2] * 10));
    let brightness = (condA != condB) ? 0 : 255;
    return [brightness, brightness, brightness];
  }

  return {
    cameraPosition,
    rotation,
    rotationMatrix,
    viewportSize,
    projectionZ,
    spheres,
    checkSpheres,
    generateBoundingSpheres,
    lights,
    backgroundColor,
    getBackgroundColor,
    reflectionLimit,
    lastShadow,
    previousPointBlockedBy,
    resetBlockerArray,
    subsampling,
    maxBoundingSphereDiameter,
    outlineBoundingSpheres,
    highlightColor,
  };
})();

// Misc stuff for fun

// module for ui in the HTML
const ui = (() => {
  // Canvas Settings
  const canvasWidth = document.getElementById("canvas-width");
  const canvasHeight = document.getElementById("canvas-height");
  // Optimizations
  const subsampleInput = document.getElementById("subsamples");
  const maxBoundingDiameterInput = document.getElementById(
    "bounding-sphere-diameter"
  );
  const highlightBoundingSphereCheckbox = document.getElementById(
    "bounding-sphere-highlight"
  );
  // Camera
  const xInput = document.getElementById("x-position");
  const yInput = document.getElementById("y-position");
  const zInput = document.getElementById("z-position");
  const xRotateInput = document.getElementById("x-rotate");
  const yRotateInput = document.getElementById("y-rotate");
  const zRotateInput = document.getElementById("z-rotate");
  // Lighting
  const reflectionLimitInput = document.getElementById("reflection-limit");
  // Scene

  function canvasClicked(event) {
    /*
    This function will generate a sphere with random size, color, and reflective properties
    at a location where it appears centered on the pixel that was clicked from the camera's perspective.
    */
    let x = event.offsetX - canvas.width / 2;
    let y = canvas.height / 2 - event.offsetY;
    let position = CanvasToViewport([x, y]);
    console.log(position);
    position = Add(
      Scene.cameraPosition,
      RotateVector(
        Scene.rotationMatrix,
        ScalarMultiply(position, Math.random() * 100 + 10)
        )
        );
        console.log(position);
    let randomColor = [
      Math.random() * 255,
      Math.random() * 255,
      Math.random() * 255,
    ];
    let randomSphere = new Sphere(
      position,
      Math.random() * 5 + 1,
      randomColor,
      Math.random() * 1000,
      Math.random(),
      Math.random()
    );
    Scene.spheres.push(randomSphere);
    Scene.generateBoundingSpheres();
    console.log(Scene.outlineBoundingSpheres);
    UpdateRender();
  }

  function GetCameraPosition() {
    const x = parseInt(xInput.value);
    const y = parseInt(yInput.value);
    const z = parseInt(zInput.value);

    Scene.cameraPosition = [x, y, z];
  }

  function GetCameraRotation() {
    const xDegrees = parseInt(xRotateInput.value);
    const yDegrees = parseInt(yRotateInput.value);
    const zDegrees = parseInt(zRotateInput.value);
    Scene.rotation = [xDegrees, yDegrees, zDegrees]; // Just in case I need to sync the UI to the Scene
    Scene.rotationMatrix = RotationMatrix(xDegrees, yDegrees, zDegrees);
  }

  function GetOptimizationSettings() {
    const subsampling = parseInt(subsampleInput.value);
    Scene.subsampling = subsampling;

    const maxBoundingSphereDiameter = parseInt(maxBoundingDiameterInput.value);
    if (maxBoundingSphereDiameter) {
      Scene.maxBoundingSphereDiameter = maxBoundingSphereDiameter;
      Scene.generateBoundingSpheres();
    }
    Scene.outlineBoundingSpheres = highlightBoundingSphereCheckbox.checked;
  }

  function GetReflectionLimit() {
    const reflectionLimit = parseInt(reflectionLimitInput.value);
    Scene.reflectionLimit = reflectionLimit;
  }

  function GetCanvasDimensions() {
    const width = parseInt(canvasWidth.value);
    const height = parseInt(canvasHeight.value);
    canvas.height = height;
    canvas.width = width;
    pixelBuffer = canvasContext.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );
    canvasPitch = pixelBuffer.width * bytesPerPixel; // Bytes per row
  }

  function SyncWithScene() {
    // Go through each element and set the values to value from Scene.
    canvasWidth.value = canvas.width;
    canvasHeight.value = canvas.height;

    subsampleInput.value = Scene.subsampling;
    maxBoundingDiameterInput.value = Scene.maxBoundingSphereDiameter;
    highlightBoundingSphereCheckbox.checked = Scene.outlineBoundingSpheres;

    xInput.value = Scene.cameraPosition[0];
    yInput.value = Scene.cameraPosition[1];
    zInput.value = Scene.cameraPosition[2];

    xRotateInput.value = Scene.rotation[0];
    yRotateInput.value = Scene.rotation[1];
    zRotateInput.value = Scene.rotation[2];

    reflectionLimitInput.value = Scene.reflectionLimit;
  }
  
  function UpdateSceneAndRender(event) {
    GetCameraPosition();
    GetCameraRotation();
    GetOptimizationSettings();
    GetReflectionLimit();
    GetCanvasDimensions();
    UpdateRender();
  }

  canvas.addEventListener("click", canvasClicked);

  document
    .getElementById("render")
    .addEventListener("click", UpdateSceneAndRender);

    return {
      SyncWithScene,
    };
})();

function handleKeyDown(event) {
  if (event.target.tagName == "INPUT") {
    return;
  }
  const key = event.code;
  let update = false;
  if (key == "KeyW") {
    ++Scene.cameraPosition[1];
    update = true;
  }
  if (key == "KeyA") {
    --Scene.cameraPosition[0];
    update = true;
  }
  if (key == "KeyS") {
    --Scene.cameraPosition[1];
    update = true;
  }
  if (key == "KeyD") {
    ++Scene.cameraPosition[0];
    update = true;
  }
  if (key == "ArrowUp") {
    ++Scene.projectionZ;
    update = true;
  }
  if (key == "ArrowDown") {
    --Scene.projectionZ;
    update = true;
  }
  if (key == "KeyR") {
    ++Scene.reflectionLimit;
    update = true;
  }
  if (key == "KeyT") {
    --Scene.reflectionLimit;
    update = true;
  }
  if (update) {
    UpdateRender();
    ui.SyncWithScene();
  } 
    
}

function zoom(event) {
  if (event.deltaY < 0) {
    ++Scene.cameraPosition[2];
  } else {
    --Scene.cameraPosition[2];
  }
  UpdateRender();
  ui.SyncWithScene();
}

document.addEventListener("keydown", handleKeyDown);
canvas.addEventListener("wheel", zoom);

// Currently testing this!
Scene.generateBoundingSpheres(20);
UpdateRender();

ui.SyncWithScene();
