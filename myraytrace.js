// function sphereFactory(center, radius, color){
//     const sphere = {center, radius, color};
//     return sphere;
// }

// ======================================================================
//  Low-level canvas access.
// ======================================================================

var canvas = document.getElementById("canvas");
var canvas_context = canvas.getContext("2d");
var canvas_buffer = canvas_context.getImageData(0, 0, canvas.width, canvas.height);
var canvas_pitch = canvas_buffer.width * 4;


// The PutPixel() function.
var PutPixel = function(x, y, color) {
  x = canvas.width/2 + x;
  y = canvas.height/2 - y - 1;

  if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
    return;
  }

  var offset = 4*x + canvas_pitch*y;
  canvas_buffer.data[offset++] = color[0];
  canvas_buffer.data[offset++] = color[1];
  canvas_buffer.data[offset++] = color[2];
  canvas_buffer.data[offset++] = 255; // Alpha = 255 (full opacity)
}


// Displays the contents of the offscreen buffer into the canvas.
var UpdateCanvas = function() {
  canvas_context.putImageData(canvas_buffer, 0, 0);
}


// ======================================================================
//  Linear algebra and helpers.
// ======================================================================

var EPSILON = 0.001;

// Dot product of two 3D vectors.
var DotProduct = function(v1, v2) {
  return v1[0]*v2[0] + v1[1]*v2[1] + v1[2]*v2[2];
}

var Add = function(v1, v2){
  return [v1[0] + v2[0], v1[1] + v2[1], v1[2] + v2[2]];
}

// Computes v1 - v2.
var Subtract = function(v1, v2) {
  return [v1[0] - v2[0], v1[1] - v2[1], v1[2] - v2[2]];
}

var Length = function(v) {
  return Math.sqrt(DotProduct(v, v));
}

var ScalarProduct = function(v, s){
  return [v[0] * s, v[1] * s, v[2] * s];
}

var ScalarDivide = function(v, s){
  return [v[0] / s, v[1] / s, v[2] / s];
}

var Clamp = function(min, max, value){
  return Math.min(Math.max(min, value), max);
}

var BrightenColor = function(color, i){
 return [Clamp(0, 255, color[0] * i), Clamp(0, 255, color[1] * i), Clamp(0, 255, color[2] * i)];
}

// ======================================================================
//  A very basic raytracer.
// ======================================================================

// A Sphere.
var Sphere = function(center, radius, color, specular, reflective) {
  this.center = center;
  this.radius = radius;
  this.color = color;
  this.specular = specular;
  this.reflective = reflective;
}

var Light = function(type, intensity, position) {
  this.type = type;
  this.intensity = intensity;
  this.position = position
}

// GLOBALS - globals - Globals
// Scene setup.
var reflection_limit = 2;
var viewport_size = 1;
var projection_plane_z = 1;
var camera_position = [0, 0, 0];
var background_color = [0, 0, 0];

var spheres = [new Sphere([0, -1, 3], 1, [255, 0, 0], 500, 0.33),
           new Sphere([2, 0, 12], 1, [0, 0, 255], 100, 0.5),
           new Sphere([-1, 0, 4], 1, [0, 255, 0], 2, 0.1),
           new Sphere([0, -5002, 0], 5001, [164, 164, 0], 1, 0.0)];

var lights = [new Light("ambient", 0.2),
              new Light("point", 0.6, [2, 1, 0]),
              new Light("directional", 0.2, [1, 4, 4]),
              new Light("point", 0.5, [1, 10, 25])];


// Converts 2D canvas coordinates to 3D viewport coordinates.
var CanvasToViewport = function(p2d) {
  return [p2d[0] * viewport_size / canvas.width,
      p2d[1] * viewport_size / canvas.height,
      projection_plane_z];
}

var ReflectRay = function(R, N) {
  return ScalarProduct(Subtract(DotProduct(N, DotProduct(N, R)), R), 2);
}

// Computes the intersection of a ray and a sphere. Returns the values
// of t for the intersections.
var IntersectRaySphere = function(origin, direction, sphere) {
  var oc = Subtract(origin, sphere.center);

  var k1 = DotProduct(direction, direction);
  var k2 = 2*DotProduct(oc, direction);
  var k3 = DotProduct(oc, oc) - sphere.radius*sphere.radius;

  var discriminant = k2*k2 - 4*k1*k3;
  if (discriminant < 0) {
    return [Infinity, Infinity];
  }

  var t1 = (-k2 + Math.sqrt(discriminant)) / (2*k1);
  var t2 = (-k2 - Math.sqrt(discriminant)) / (2*k1);
  return [t1, t2];
}

var ClosestIntersection = function(origin, direction, t_min, t_max){
  let closest_t = Infinity;
  let closest_sphere = null;

  for(let i = 0; i < spheres.length; i++){
    let ts = IntersectRaySphere(origin, direction, spheres[i]);
    if(ts[0] < closest_t && t_min < ts[0] && ts[0] < t_max) {
      closest_t = ts[0];
      closest_sphere = spheres[i];
    }
    if (ts[1] < closest_t && ts[1] < t_max && t_min < ts[1]){
      closest_sphere = spheres[i];
      closest_t = ts[1];
    }
  }
  return [closest_t, closest_sphere];
}

var ComputeLighting = function(P, N, V, s){
  i = 0.0;
  for(let index = 0; index < lights.length; index++){
    light = lights[index];
    if(light.type == "ambient"){
      i += light.intensity;
    } else {
      let L;
      if(light.type == "point"){
        L = Subtract(light.position, P);
      } else {
        L = light.position;
      }

      if(ClosestIntersection(P, L, EPSILON, 1.0)[1] == null){

        let n_dot_l = DotProduct(N, L);
        if(n_dot_l > 0){
          i += light.intensity * n_dot_l / (Length(N) * Length(L));
        }

        if(s != -1) {
          let R = Subtract(ScalarProduct(N, n_dot_l * 2.0), L);
          let r_dot_v = DotProduct(R, V);
          if(r_dot_v > 0) {
            i += light.intensity * Math.pow(r_dot_v / (Length(R) * Length(V)), s);
          }
        }
      }
    }
  }
  return i;
}


// Traces a ray against the set of spheres in the scene.
var TraceRay = function(origin, direction, min_t, max_t, recursion_depth) {
  let intersection = ClosestIntersection(origin, direction, min_t, max_t);
  let closest_t = intersection[0];
  let closest_sphere = intersection[1];

  if (closest_sphere == null) {
    return background_color;
  }

  let point = Add(origin, ScalarProduct(direction, closest_t));
  let normal = Subtract(point, closest_sphere.center);
  normal = ScalarDivide(normal, Length(normal));

  let lighting = ComputeLighting(point, normal, ScalarProduct(direction, -1), closest_sphere.specular);
  let local_color = BrightenColor(closest_sphere.color, lighting);

  if(closest_sphere.reflective > 0 && recursion_depth > 0){
    let reflection = ReflectRay(ScalarProduct(direction, -1), normal);
    reflection_color = TraceRay(point, reflection, EPSILON, Infinity, recursion_depth - 1);
    return Add(BrightenColor(local_color, (1 - closest_sphere.reflective)),
           BrightenColor(reflection_color, closest_sphere.reflective));
  } else {
    return local_color;
  }
}

//
// Main loop.
//
function Render(){
  let count = 0;
  for (var x = -canvas.width/2; x < canvas.width/2; x++) {
    for (var y = -canvas.height/2; y < canvas.height/2; y++) {
      var direction = CanvasToViewport([x, y]);
      var color = TraceRay(camera_position, direction, 1, Infinity, reflection_limit);
      PutPixel(x, y, color);
    }
  }
}

function UpdateUI(){
  let sphereHTML = "";
  for(let i = 0; i < spheres.length; i++){
    let pHTML = '<p>';
    for(let key in spheres[i]){
      pHTML += `${key}: ${spheres[i][key]} | `;
    }
    pHTML += '</p>';
      sphereHTML += pHTML;
  }
  let sphereDiv = document.getElementById("sphere-info")
  sphereDiv.innerHTML = sphereHTML;
  let lightHTML = "";
  for(let i = 0; i < lights.length; i++){
    let pHTML = '<p>';
    for(let key in lights[i]){
      pHTML += `${key}: ${lights[i][key]}`;
    }
    pHTML += '</p>';
    lightHTML += pHTML;
  }
  let lightDiv = document.getElementById("lights")
  lightDiv.innerHTML = lightHTML;
  let cameraDiv = document.getElementById("camera")
  cameraDiv.textContent = JSON.stringify(camera_position);
  let reflectionP = document.getElementById("reflection-limit")
  reflectionP.textContent = reflection_limit;
}

function UpdateRender(){
  Render();
  UpdateCanvas();
  UpdateUI();
}

function handleKeyDown(event){
  key = event.code;
  if(key == "KeyW"){
    ++camera_position[1];
  }
  if(key == "KeyA"){
    --camera_position[0];
  }
  if(key == "KeyS"){
    --camera_position[1];
  }
  if(key == "KeyD"){
    ++camera_position[0];
  }
  if(key == "ArrowUp"){
    ++projection_plane_z;
  }
  if(key == "ArrowDown"){
    --projection_plane_z;
  }
  if(key == "KeyR"){
    ++reflection_limit;
  }
  if(key == "KeyT"){
    --reflection_limit;
  }
  UpdateRender();
}

function zoom(event) {
  if(event.deltaY < 0) {
    ++camera_position[2];
  } else {
    --camera_position[2];
  }
  UpdateRender();
}

document.addEventListener("keydown", handleKeyDown);
document.addEventListener("wheel", zoom);

window.addEventListener("DOMContentLoaded", UpdateRender);
UpdateRender();