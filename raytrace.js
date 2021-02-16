/* 
 * Mark Schloeman - raytrace.js - 2/15/2021
 * I'm making this script to practice the basics of raytracing.
 * I just finished reading the Ray Tracing section of
 * Graphics Programming From Scratch (https://gabrielgambetta.com/computer-graphics-from-scratch/)
 * and I want to write my own version so I can review the concepts
 * and also make it in a way that I am more comfortable extending.
 */

 // Globals that don't feel right inside of the Scene object
 const EPSILON = 0.001;

//Linear Algebra and other Math

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

function IntersectRaySphere(origin, direction, sphere){
    let oc = Subtract(origin, sphere.center);

    // Young Mark would have never expected that I would use the quadratic
    // equation in my adult life... and on my own volition!
    let a = DotProduct(direction, direction);
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

function ClosestIntersection(origin, direction, minT, maxT){
    let closestT = Infinity;
    let closestSphere = null;

    for(let i = 0; i < Scene.spheres.length; i++){
        let ts = IntersectRaySphere(origin, direction, Scene.spheres[i]);
        if( ts[0] < closestT && ts[0] > minT && ts[0] < maxT ){
            closestT = ts[0];
            closestSphere = Scene.spheres[i];
        }
        if( ts[1] < closestT && ts[1] > minT && ts[1] < maxT ){
            closestT = ts[1];
            closestSphere = Scene.spheres[i];
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

            if(ClosestIntersection(point, lightRay, EPSILON, 1.0)[1] == null){
                let normalDotLightRay = DotProduct(normal, lightRay);
                if(normalDotLightRay > 0){
                    intensity += light.intensity * normalDotLightRay / (Length(normal) * Length(lightRay));
                }

                if(specular != -1){
                    let reflection = ReflectRay(lightRay, normal);
                    let reflectionDotVector = DotProduct(reflection, vector);
                    if(reflectionDotVector > 0){
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

function Render(){
    for(let x = -canvas.width / 2; x < canvas.width / 2; x++){
        for(let y = -canvas.height / 2; y < canvas.height / 2; y++){
            let direction = CanvasToViewport([x, y]);
            direction = RotateVector(Scene.rotation, direction);
            let color = TraceRay(Scene.cameraPosition, direction, 1, Infinity, Scene.reflectionLimit);
            PutPixel(x, y, color);
        }
    }
}

function UpdateRender(){
    const start = performance.now();
    Render();
    UpdateCanvas();
    console.log(`Rendered in ${performance.now() - start}ms`);
}

// Scene

const Scene = (() => {
    let cameraPosition = [0, 10, -20];
    let viewportSize = 1;
    let reflectionLimit = 4;
    let projectionZ = 1;
    let rotation = RotationMatrix(10, 0, 0);
    let backgroundColor = [8, 8, 16];

    let spheres = [
        new Sphere([0, -1, 3], 1, [255, 255, 255], 100, 0.5),
        new Sphere([2, 1, 5], 1, [255, 0, 0], 1000, 0.2),
        new Sphere([0, -502, 0], 501, [30, 80, 10], 1, 0.1),
        new Sphere([-300, 20, 1000], 50, [248, 248, 248], 10000, 0.8),
    ];

    let lights = [
        new Light(Light.ambient, 0.58),
        //new Light(Light.directional, 0.3, [1, 0, 0]),
        new Light(Light.point, 0, [-500, -70, -100])
    ];

    return {
        cameraPosition,
        rotation,
        viewportSize,
        projectionZ,
        spheres,
        lights,
        backgroundColor,
        reflectionLimit,
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
UpdateRender();