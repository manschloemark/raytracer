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
    (v1[1] * v2[2] - v1[2] * v2[1]),
    (v1[2] * v2[0] - v1[0] * v2[2]),
    (v1[0] * v2[1] - v1[1] * v2[0])
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
function Sphere(center, radius, color, specular, reflection) {
  return {
    center,
    radius,
    color,
    specular,
    reflection,
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

function ClosestIntersection(origin, direction, minT, maxT) {
  let closestT = Infinity;
  let closestSphere = null;

  const dDotd = DotProduct(direction, direction);
  for (let i = 0; i < Scene.checkSpheres.length; i++) {
    let sphere = Scene.checkSpheres[i];
    let ts = IntersectRaySphere(origin, direction, sphere, dDotd);

    if (sphere.bounding && Scene.outlineBoundingSpheres && Math.abs(ts[0] - ts[1]) < 2.5) {
      return [ts[0], sphere];
      }

    if (ts[0] < closestT && ts[0] > minT && ts[0] < maxT) {
      if (sphere.bounding) { // If intersects bounding sphere
        for (let j = 0; j < sphere.nestedSpheres.length; j++) {
          let nsphere = sphere.nestedSpheres[j];
          let nts = IntersectRaySphere(origin, direction, nsphere, dDotd);
          if (nts[0] < closestT && nts[0] > minT && nts[0] < maxT) {
            closestT = nts[0];
            closestSphere = nsphere;
          }
          if (nts[1] < closestT && nts[1] > minT && nts[1] < maxT) {
            closestT = nts[1];
            closestSphere = nsphere;
          }
        }
      } else {
        closestT = ts[0];
        closestSphere = sphere;
      }
    }

    if (ts[1] < closestT && ts[1] > minT && ts[1] < maxT) {
      if (sphere.bounding) { // If intersects bounding sphere
        for (let j = 0; j < sphere.nestedSpheres.length; j++) {
          let nsphere = sphere.nestedSpheres[j];
          let nts = IntersectRaySphere(origin, direction, nsphere, dDotd);
          if (nts[0] < closestT && nts[0] > minT && nts[0] < maxT) {
            closestT = nts[0];
            closestSphere = nsphere;
          }
          if (nts[1] < closestT && nts[1] > minT && nts[1] < maxT) {
            closestT = nts[1];
            closestSphere = nsphere;
          }
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
  let intersection = ClosestIntersection(origin, direction, minT, maxT);
  let t = intersection[0];
  let object = intersection[1];
  Scene.lastHit = Scene.currentHit;
  Scene.currentHit = object;

  if (object == null) {
    return Scene.getBackgroundColor(origin, direction);
  }

  if(object.bounding) {
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

  return localColor;
}

// canvas and pixel placement
const canvas = document.getElementById("canvas");
const canvasContext = canvas.getContext("2d");
const pixelBuffer = canvasContext.getImageData(
  0,
  0,
  canvas.width,
  canvas.height
);
const bytesPerPixel = 4;
const canvasPitch = pixelBuffer.width * bytesPerPixel; // Bytes per row

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
  direction = RotateVector(Scene.rotation, direction);
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
  if ( !ySubsampling || ySubsampling == 1) {
    RenderScene();
  } else {
    let yOffset = canvas.height % ySubsampling
    let minY = -canvas.height / 2 + yOffset
    for (let x = -canvas.width / 2; x < canvas.width / 2; x++) {
      for (let y = minY; y < canvas.height / 2; y += ySubsampling) {
        let color = RenderPixel(x, y);
        PutPixel(x, y, color);
        if (y > minY && Scene.lastHit !== Scene.currentHit) {
          for (let k = ySubsampling - 1; k > 0; k--) {
            PutPixel(x, y - k, RenderPixel(x, y - k));
          }
        } else {
          for (let k = ySubsampling - 1; k > 0; k--) {
            PutPixel(x, y - k, color);
          }
        }
      }
      Scene.resetBlockerArray();
    }
  }
}

function UpdateRender() {
  const start = performance.now();
  SubsampleRenderScene(Scene.subsampling);
  UpdateCanvas();
  console.log(`Rendered in ${performance.now() - start}ms`);
}

// Scene
const Scene = (() => {
  let cameraPosition = [0, 0, -50];
  let viewportSize = 1;
  let reflectionLimit = 4;
  let projectionZ = 1;
  let rotation = RotationMatrix(0, 0, 0);
  let backgroundColor = [8, 8, 16];
  let lastShadow = false;
  let subsampling = 0;
  let maxBoundingSphereDiameter = 10;
  let outlineBoundingSpheres = false;
  let highlightColor = [255, 255, 255];

  // Sample Scene
  // let spheres = [
  //     new Sphere([0, -1, 3], 1, [255, 255, 255], 100, 0.5),
  //     new Sphere([2, 1, 5], 1, [255, 0, 0], 1000, 0.2),
  //     new Sphere([0, -502, 0], 501, [30, 80, 10], 1, 0.1),
  //     new Sphere([-300, 20, 1000], 50, [248, 248, 248], 10000, 0.8),
  // ];

  // Debugging for specific goals
  let spheres = [
    new Sphere([-2, 0, 5], 1, [255, 0, 0], -1, 1),
    new Sphere([0, 0, 5], 1, [0, 0, 255], -1, 1),
    new Sphere([2, 0, 5], 1, [0, 255, 0], -1, 1),
    new Sphere([0, 6, 10], 1, [255, 255, 0], -1, 1),
  ];

  let checkSpheres = [];

  let lights = [
    new Light(Light.ambient, 0.2),
    new Light(Light.directional, 0.3, [0, 1, -1]),
    new Light(Light.point, 0.5, [-500, -70, -100])
  ];

  let lastHit = null;
  let currentHit = null;
  let previousPointBlockedBy = lights.map((light) => null); // Array where indices map to lights and values are indices of the sphere that blocked the light on the last pass

  function resetBlockerArray() {
    previousPointBlockedBy = lights.map((light) => null);
  }

  function generateBoundingSpheres() {
    console.log(this.maxBoundingSphereDiameter);
    spheres.forEach(sphere => sphere.isBound = false);
    // * Scene now has an array checkSpheres which contains bounding spheres and spheres
    //   the nested spheres and top-level spheres comprise the Scene.spheres array

    // * Spheres now have an attribute isBound that I use
    //   to determine which spheres need to be added to
    //   checkSpheres individually.

    // * I'm not 100% satisfied on the way I use these in the actual
    //   ray tracing part of the program.
    //   * Sphere and BoundingSphere 'classes' have boolean attributes called
    //     bounding. BoundingSpheres have this set to true.
    //     This is because IntersectRaySphere does not know the difference
    //     between the types of spheres.
    //     So in ClosestSphere, you have to check if a sphere is a bounding
    //     sphere and if it is you must then loop through the bounded spheres.
    //     This is currently implemented in a **really** ugly fashion.
    //     I'd like to do more thinking about this and come up with a better
    //     API.

    // * The outer most list creates a sphereGroup Array each pass
    //   but sometimes it ends without any addition spheres added
    //   in this case I do not bother to make a boundingSphere because it is an
    //   isolated sphere.

    // * Sometimes I make redundant BoundingSpheres that are sub-spheres of
    //   existing bounding spheres.
    //   To prevent this from effecting the rendering I check each bounding sphere
    //   if it is completely encapsulated by an existing bounding sphere.
    //   This works. But I wonder if there's an easier way to prevent this from happening
    //   entirely.

    // * This is still majorly a work in progress!

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
            !(Length(
              Subtract(existingBoundingSphere.center, boundingSphere.center)
            ) +
              boundingSphere.radius >
              existingBoundingSphere.radius);
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
    let color = [(Math.cos(direction[1]) + 0.5) * 125,
                 (Math.sin(direction[0]) + 0.5) * 125,
                 (Math.cos(direction[1]) + 0.33) * 125];
    return color;
  }

  return {
    cameraPosition,
    rotation,
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
  const subsampleInput = document.getElementById("subsamples");
  const xRotateInput = document.getElementById("x-rotate");
  const yRotateInput = document.getElementById("y-rotate");
  const zRotateInput = document.getElementById("z-rotate");
  const maxBoundingDiameterInput = document.getElementById("bounding-sphere-diameter");
  const highlightBoundingSphereCheckbox = document.getElementById("bounding-sphere-highlight");
  
  function canvasClicked(event) {
    /*
    This function will generate a sphere with random size, color, and reflective properties
    at a location where it appears centered on the pixel that was clicked from the camera's perspective.
    */
   let x = event.offsetX - canvas.width / 2;
   let y = canvas.height / 2 - event.offsetY;
   let position = CanvasToViewport([x, y]);
   position = Add(
     Scene.cameraPosition,
     RotateVector(
       Scene.rotation,
       ScalarMultiply(position, Math.random() * 100 + 10)
       )
       );
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
          Math.random()
          );
          Scene.spheres.push(randomSphere);
          Scene.generateBoundingSpheres();
          console.log(Scene.outlineBoundingSpheres);
          UpdateRender();
        }
        
  function UpdateCameraRotation() {
    const xDegrees = xRotateInput.value;
    const yDegrees = yRotateInput.value;
    const zDegrees = zRotateInput.value;
    Scene.rotation = RotationMatrix(xDegrees, yDegrees, zDegrees);
  }
  
  function UpdateOptimizationSettings() {
    const subsampling = parseInt(subsampleInput.value);
    const maxBoundingSphereDiameter = parseInt(maxBoundingDiameterInput.value);
    
    if (subsampling) {
      Scene.subsampling = subsampling;
    }
    
    if (maxBoundingSphereDiameter) {
      Scene.maxBoundingSphereDiameter = maxBoundingSphereDiameter;
      Scene.generateBoundingSpheres();
    }
    Scene.outlineBoundingSpheres = highlightBoundingSphereCheckbox.checked
  }
  
  function UpdateSceneAndRender(event) {
    UpdateCameraRotation();
    UpdateOptimizationSettings();
    UpdateRender();
  }
  
  canvas.addEventListener("click", canvasClicked);
  
  document
  .getElementById("render")
  .addEventListener("click", UpdateSceneAndRender);
})();


function handleKeyDown(event){
  if (event.target.tagName == "INPUT") {
    return;
  }
  const key = event.code;
  let update = false;
  if(key == "KeyW"){
    ++Scene.cameraPosition[1];
    update = true;
  }
  if(key == "KeyA"){
    --Scene.cameraPosition[0];
    update = true;
  }
  if(key == "KeyS"){
    --Scene.cameraPosition[1];
    update = true;
  }
  if(key == "KeyD"){
    ++Scene.cameraPosition[0];
    update = true;
  }
  if(key == "ArrowUp"){
    ++Scene.projectionZ;
    update = true;
  }
  if(key == "ArrowDown"){
    --Scene.projectionZ;
    update = true;
  }
  if(key == "KeyR"){
    ++Scene.reflectionLimit;
    update = true;
  }
  if(key == "KeyT"){
    --Scene.reflectionLimit;
    update = true;
  }
  if(update) UpdateRender();
}

function zoom(event) {
  if(event.deltaY < 0) {
    ++Scene.cameraPosition[2];
  } else {
    --Scene.cameraPosition[2];
  }
  UpdateRender();
}

document.addEventListener("keydown", handleKeyDown);
canvas.addEventListener("wheel", zoom);
        
        // Currently testing this!
Scene.generateBoundingSpheres(20);   
UpdateRender();

