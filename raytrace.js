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

//Linear Algebra and other Math

function Midpoint2 (v1, v2) {
    return ScalarDivide(Add(v1, v2), 2);
}

function Midpoint (pointArray) {
    let center = pointArray.reduce((a, b) => Add(a, b));
    center = ScalarDivide(center, pointArray.length);
    return center;
}

// Vector on Vector action
function DotProduct(v1, v2) {
    return v1[0]*v2[0] + v1[1]*v2[1] + v1[2]*v2[2];
}
  
function Add(v1, v2){
    return [v1[0] + v2[0], v1[1] + v2[1], v1[2] + v2[2]];
}
  
function Subtract(v1, v2) {
    return [v1[0] - v2[0], v1[1] - v2[1], v1[2] - v2[2]];
  }
  
function Length(v) {
    return Math.sqrt(DotProduct(v, v));
  }
  
function ScalarMultiply(v, s){
    return [v[0] * s, v[1] * s, v[2] * s];
  }
  
function ScalarDivide(v, s){
    return [v[0] / s, v[1] / s, v[2] / s];
  }
  
function MatrixMultiply(m, v){
    let result = [0, 0, 0];
  
    for(let i = 0; i < 3; i++){
      for(let j = 0; j < 3; j++){
        result[i] += v[j] * m[i][j];
      }
    }
    return result;
  }

function DegreesToRadians(degrees){
    return (degrees * Math.PI) / 180;
}
  
function XRotationMatrix(degrees){
    const radians = DegreesToRadians(degrees);
    const cosValue = Math.cos(radians);
    const sinValue = Math.sin(radians);
    return [
      [1, 0, 0],
      [0, cosValue, -sinValue],
      [0, sinValue, cosValue]
    ];
  }
  
function YRotationMatrix(degrees){
    const radians = DegreesToRadians(degrees);
    const cosValue = Math.cos(radians);
    const sinValue = Math.sin(radians);
    return [
      [cosValue, 0, sinValue],
      [0, 1, 0],
      [-sinValue, 0, cosValue]
    ];
  }
  
function ZRotationMatrix(degrees){
    const radians = DegreesToRadians(degrees);
    const cosValue = Math.cos(radians);
    const sinValue = Math.sin(radians);
    return [
      [cosValue, -sinValue, 0],
      [sinValue, cosValue, 0],
      [0, 0, 1]
    ];
}
  
function RotationMatrix(x, y, z){
    return [XRotationMatrix(x), YRotationMatrix(y), ZRotationMatrix(z)]
}

function RotateVector(rotationMatrix, direction){
    for(let i = 0; i < rotationMatrix.length; i++){
      direction = MatrixMultiply(rotationMatrix[i], direction);
    }
    return direction;
  }
  
function Clamp(min, max, value){
    return Math.min(Math.max(min, value), max);
}
  
// Colors
function BrightenColor(color, i){
    return [Clamp(0, 255, color[0] * i), Clamp(0, 255, color[1] * i), Clamp(0, 255, color[2] * i)];
}

function Sphere(center, radius, color, specular, reflection){
    return {
        center,
        radius,
        color,
        specular,
        reflection,
        bounding: false,
    };
}

function BoundingSphere(center, radius, nestedSpheres){
    return {
        center,
        radius,
        nestedSpheres,
        bounding: true,
    };
}

function Light(type, intensity, position){
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

function ReflectRay(reflect, normal){
    return Subtract(ScalarMultiply(normal, 2 * DotProduct(normal, reflect)), reflect);
}

function IntersectRaySphere(origin, direction, sphere, a){
    let oc = Subtract(origin, sphere.center);

    // Young Mark would have never expected that I would use the quadratic
    // equation in my adult life... and on my own volition!
    //let a = DotProduct(direction, direction); - Passing a from ClosestIntersection because it does not change
    let b = DotProduct(oc, direction) * 2;
    let c = DotProduct(oc, oc) - sphere.radius * sphere.radius;

    let discriminant = b * b - 4 * a * c;
    if(discriminant < 0){
        return [Infinity, Infinity];
    }

    let t1 = (-b + Math.sqrt(discriminant)) / (2 * a);
    let t2 = (-b - Math.sqrt(discriminant)) / (2 * a);
    return [t1, t2];
}

function AnyIntersection(origin, direction, minT, maxT, lastBlockerIndex){
    const dDotd = DotProduct(direction, direction);
    if (lastBlockerIndex !== null){
        let ts = IntersectRaySphere(origin, direction, Scene.spheres[lastBlockerIndex], dDotd);
        if(( ts[0] > minT && ts[0] < maxT ) || ( ts[1] > minT && ts[1] < maxT )){
            return lastBlockerIndex;
        }
    }
    for(let i = 0; i < Scene.spheres.length; i++){
        let ts = IntersectRaySphere(origin, direction, Scene.spheres[i], dDotd);
        if(( ts[0] > minT && ts[0] < maxT ) || ( ts[1] > minT && ts[1] < maxT )){
            return i;
        }
    }
    return null
}

function OldClosestIntersection(origin, direction, minT, maxT){
    let closestT = Infinity;
    let closestSphere = null;

    const dDotd = DotProduct(direction, direction);
    for(let i = 0; i < Scene.spheres.length; i++){
        let sphere = Scene.spheres[i];
        let ts = IntersectRaySphere(origin, direction, sphere, dDotd);
        if( ts[0] < closestT && ts[0] > minT && ts[0] < maxT ){
            closestT = ts[0];
            closestSphere = sphere;
        }
        if( ts[1] < closestT && ts[1] > minT && ts[1] < maxT ){
            closestT = ts[1];
            closestSphere = sphere;
        }
    }
    return [closestT, closestSphere];
}

function ClosestIntersection(origin, direction, minT, maxT){
    let closestT = Infinity;
    let closestSphere = null;

    const dDotd = DotProduct(direction, direction);
    for(let i = 0; i < Scene.checkSpheres.length; i++){
        let sphere = Scene.checkSpheres[i];
        let ts = IntersectRaySphere(origin, direction, sphere, dDotd);
        if( ts[0] < closestT && ts[0] > minT && ts[0] < maxT ){
            if (sphere.bounding) {
                for (let j = 0; j < sphere.nestedSpheres.length; j++) {
                    let nsphere = Scene.spheres[j];
                    let nts = IntersectRaySphere(origin, direction, nsphere, dDotd);
                    if ( nts[0] < closestT && nts[0] > minT && nts[0] < maxT ){
                        closestT = nts[0];
                        closestSphere = nsphere;
                    }
                    if ( nts[1] < closestT && nts[1] > minT && nts[1] < maxT ){
                        closestT = nts[1];
                        closestSphere = nsphere;
                    }           
                }
            } else {
                closestT = ts[0];
                closestSphere = sphere;
            }
        }
        if( ts[1] < closestT && ts[1] > minT && ts[1] < maxT ){
            if (sphere.bounding) {
                for(let j = 0; j < sphere.nestedSpheres.length; j++) {
                    let nsphere = Scene.spheres[j];
                    let nts = IntersectRaySphere(origin, direction, nsphere, dDotd);
                    if( nts[0] < closestT && nts[0] > minT && nts[0] < maxT ){
                        closestT = nts[0];
                        closestSphere = nsphere;
                    }
                    if( nts[1] < closestT && nts[1] > minT && nts[1] < maxT ){
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

function ComputeLighting(point, normal, vector, specular){
    let intensity = 0.0;

    for(let i = 0; i < Scene.lights.length; i++){
        let light = Scene.lights[i];
        if(light.type == Light.ambient){
            intensity += light.intensity;
        } else {
            let lightRay;

            if(light.type == Light.point){
                lightRay = Subtract(light.position, point);
            } else {
                lightRay = light.position;
            }

            const blockedBy = AnyIntersection(point, lightRay, EPSILON, 1.0, Scene.previousPointBlockedBy[i]);
            Scene.previousPointBlockedBy[i] = blockedBy;
            if (blockedBy === null) {
                let normalDotLightRay = DotProduct(normal, lightRay);
                if (normalDotLightRay > 0) {
                    intensity += light.intensity * normalDotLightRay / (Length(normal) * Length(lightRay));
                }

                if (specular != -1) {
                    let reflection = ReflectRay(lightRay, normal);
                    let reflectionDotVector = DotProduct(reflection, vector);
                    if (reflectionDotVector > 0){
                        intensity += light.intensity *
                                Math.pow(reflectionDotVector / (Length(reflection) * Length(vector)), specular);
                    }
                }
            }
        }
    }
    return intensity;
}

function TraceRay(origin, direction, minT, maxT, recursionDepth){
    let intersection = ClosestIntersection(origin, direction, minT, maxT);
    let t = intersection[0];
    let sphere = intersection[1];
    Scene.lastHit = Scene.currentHit;
    Scene.currentHit = sphere;
    if(sphere == null){
        return Scene.backgroundColor;
    }

    let point = Add(origin, ScalarMultiply(direction, t));
    let normal = Subtract(point, sphere.center);
    normal = ScalarDivide(normal, Length(normal));
    let negativeDirection = ScalarMultiply(direction, -1);
    let lighting = ComputeLighting(point, normal, negativeDirection, sphere.specular);
    let localColor = BrightenColor(sphere.color, lighting);

    if(sphere.reflective > 0 && recursionDepth > 0){
        let reflection = ReflectRay(negativeDirection, normal);
        let reflectionColor = TraceRay(point, reflection, EPSILON, Infinity, recursionDepth - 1);
        localColor = Add(
                        BrightenColor(localColor, 1 - sphere.reflective),
                        BrightenColor(reflectionColor, sphere.reflective)
                        );
    }

    return localColor;
}

const canvas = document.getElementById("canvas");
const canvasContext = canvas.getContext('2d');
const pixelBuffer = canvasContext.getImageData(0, 0, canvas.width, canvas.height);
const bytesPerPixel = 4;
const canvasPitch = pixelBuffer.width * bytesPerPixel // Bytes per row

function PutPixel(x, y, color){
    x += canvas.width / 2;
    y = canvas.height / 2 - y - 1;
    if(x < 0 || x >= canvas.width || y < 0 || y >= canvas.height){
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

function CanvasToViewport(xy){
    return [
        xy[0] * Scene.viewportSize / canvas.width,
        xy[1] * Scene.viewportSize / canvas.height,
        Scene.projectionZ
    ];
}

function RenderPixel(x, y){
    let direction = CanvasToViewport([x, y]);
    direction = RotateVector(Scene.rotation, direction);
    let color = TraceRay(Scene.cameraPosition, direction, 1, Infinity, Scene.reflectionLimit);
    return color;
}

function RenderScene(){
    for (let x = -canvas.width / 2; x < canvas.width / 2; x++) {
        for (let y = -canvas.height / 2; y < canvas.height / 2; y += 2) {
            let color = RenderPixel(x, y);
            PutPixel(x, y, color);
            if (y > 0 && (Scene.lastHit !== Scene.currentHit)) {
                PutPixel(x, y - 1, RenderPixel(x, y-1));
            } else {
                PutPixel(x, y - 1, color);
            }
        }
        Scene.resetBlockerArray();
    }
}

function UpdateRender(){
    const start = performance.now();
    RenderScene();
    UpdateCanvas();
    console.log(`Rendered in ${performance.now() - start}ms`);
}

// Scene

const Scene = (() => {
    let cameraPosition = [0, 20, 5];
    let viewportSize = 1;
    let reflectionLimit = 4;
    let projectionZ = 1;
    let rotation = RotationMatrix(90, 0, 0);
    let backgroundColor = [8, 8, 16];
    let lastShadow = false;

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
        new Sphere([2, 0, 5], 1, [0, 0, 255], -1, 1),
        new Sphere([6, 0, 5], 1, [0, 255, 0], -1, 1),
        //new Sphere([0, 10, 10], 1, [0, 255, 0], -1, 1),
    ];

    let checkSpheres = [];

    let lights = [
        new Light(Light.ambient, 0.2),
        new Light(Light.directional, 0.3, [0, 1, -1]),
        //new Light(Light.point, 0.5, [-500, -70, -100])
    ];

    let lastHit = null;
    let currentHit = null;
    let previousPointBlockedBy = lights.map(light => null); // Array where indices map to lights and values are indices of the sphere that blocked the light on the last pass

    function resetBlockerArray () {
        previousPointBlockedBy = lights.map(light => null);
    }

    function generateBoundingSpheres(maxDiameter){
        // This function aims to search through the list of spheres and filter them into
        // larger 'Bounding Spheres'
        // The benefit of doing this is that when searching for intersections I can first check if the ray
        // intersects the bounding sphere. If it does not, I can rule out multiple spheres at once.

        // So how do I do this?
        // I guess that right now the performance of this function is not hugely important.
        // I'm only going to call it once on startup and whenever a sphere is added.

        // Brute force?
        // Loop through all spheres. 
        //    At each sphere, check if the distance to any other sphere is within maxRange.
        //    If it is, create a bounding sphere at the midpoint between these spheres and give it a radius such that it contains both spheres.
        //    Now that you have a bounding sphere you are checking the rest of the spheres if they can be added to the bounding sphere.
        //    You must compare the rest of the spheres against EVERY sphere in the bounding sphere.
        //    Determine the greatest distance between target sphere and all spheres in the bounding sphere.
        //      If that max distance is within maxDiameter, you can add this sphere to the existing Bounding Sphere.
        //      When you add a sphere to a bounding sphere, the bounding sphere diameter may need to change, and it should
        //      -- Algorithim for finding midpoint between N points in 3D space?

        // Should spheres be able to be in multiple bounding spheres?
        //   - My intuition says yes. But could this cause me to create more bounding spheres than necessary? Would it kill the efficiency?

        // Things to worry about:
        //   Suppose you are looping through a list of Spheres [X, Y,  Z, W]. You start by comparing Sphere X to all other spheres.
        //   - Comparing Sphere X against all other Spheres finds that Sphere Y can be added a bounding sphere.
        //   - Fast forward to the next iteration of the loop. You are comparing every sphere to Sphere Y.
        //   - You find that Sphere X is in range of Sphere Y. But you already did this exact check! There's no point in adding a bounding sphere for this!
        //     - I think this is a non-issue because I can have my loop go so the inner-loop starts at the index after the outer loop.
        //     

        // There are some 'leads' I have:
        //  If a sphere is not in range of ANY other spheres, you can safely remove that from all other calculations.
        //  

        // I'm just gonna try getting something out there before work
        let newBoundingSpheres = []; // Temp array for new spheres so I don't alter Scene.spheres while looping
        for (let i = 0; i < spheres.length - 1; i++) {
            let sphereGroup = [spheres[i]];
            let maxSphereDistance = 0;  // This is a bad name - it represents the largest distance between two spheres in a sphere group.
            for (let j = i + 1; j < spheres.length; j++) {
                let sphereB = spheres[j];
                let fitsInGroup = true;
                for (let k = 0; k < sphereGroup.length; k++) {
                    let sphereA = sphereGroup[k];
                    distance = Length(Subtract(sphereA.center, sphereB.center)) + sphereA.radius + sphereB.radius;
                    if (distance > maxDiameter){
                        fitsInGroup = false;
                    } else {
                        maxSphereDistance = Math.max(distance, maxSphereDistance);
                    }
                }
                if (fitsInGroup) {
                    sphereGroup.push(sphereB);
                }
            }
            if (sphereGroup.length > 1) {
                let center = Midpoint(sphereGroup.map(sphere => sphere.center));
                console.log("Sphere group", sphereGroup);
                console.log("Center of sphere group", center);
                console.log("Diameter of sphere group", maxSphereDistance);
                let boundingSphere = new BoundingSphere(center, distance, sphereGroup);
                
                // Check if the current bounding sphere exists wholly within
                // and existing bounding sphere
                // If it does, it is redundant.
                let redundant = false;
                for (let i = 0; i < newBoundingSpheres.length; i++) {
                    let existingBoundingSphere = newBoundingSpheres[i];
                    if ((Length(Subtract(existingBoundingSphere.center, boundingSphere.center))
                        + boundingSphere.radius) > existingBoundingSphere.radius) {
                        redundant = true;
                    }
                }
                if ( ! redundant ) {
                    newBoundingSpheres.push(boundingSphere);
                }
            } else {
                newBoundingSpheres.push(spheres[i]);
            }
        }
        console.log(newBoundingSpheres);
        this.checkSpheres = newBoundingSpheres;
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
        reflectionLimit,
        lastShadow,
        previousPointBlockedBy,
        resetBlockerArray,
    };
})();

// Misc stuff for fun

function canvasClicked(event){
    /*
        This function will generate a sphere with random size, color, and reflective properties
        at a location where it appears centered on the pixel that was clicked from the camera's perspective.
    */
    let x = event.offsetX - canvas.width / 2;
    let y = canvas.height / 2 - event.offsetY;
    let position = CanvasToViewport([x, y]);
    position = Add(Scene.cameraPosition, RotateVector(Scene.rotation, ScalarMultiply(position, Math.random() * 100 + 10)));
    let randomColor = [
        Math.random() * 255,
        Math.random() * 255,
        Math.random() * 255
    ];
    let randomSphere = new Sphere(position, Math.random() * 5 + 1, randomColor, Math.random() * 1000, Math.random())
    Scene.spheres.push(randomSphere);
    UpdateRender();
}

function UpdateCameraRotation(event){
    const xDegrees = document.getElementById("x-rotate").value;
    const yDegrees = document.getElementById("y-rotate").value;
    const zDegrees = document.getElementById("z-rotate").value;
    Scene.rotation = RotationMatrix(xDegrees, yDegrees, zDegrees);
    UpdateRender();
}

canvas.addEventListener("click", canvasClicked);
document.getElementById("set-camera").addEventListener("click", UpdateCameraRotation);

// Currently testing this!
Scene.generateBoundingSpheres(10);

UpdateRender();