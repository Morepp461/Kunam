import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.181.1/build/three.module.js";

const host = document.querySelector(".car-stage");
if (!host) throw new Error("Hero 3D container tidak ditemukan");

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x08090b, 0.035);

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
camera.position.set(5.7, 4.2, 9.2);
camera.lookAt(-0.1, 0.9, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.className = "hero-canvas";
renderer.domElement.setAttribute("aria-label", "Visual 3D mobil Caleris Masters dan dua pembalap");
host.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xcbd4e2, 0x15110a, 2.0));
const key = new THREE.DirectionalLight(0xffe5ad, 3.4);
key.position.set(4, 8, 6); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
scene.add(key);
const rim = new THREE.DirectionalLight(0xb7c2d3, 2.5); rim.position.set(-6, 4, -5); scene.add(rim);
const goldFill = new THREE.PointLight(0xd3a83f, 28, 14); goldFill.position.set(0, 2.3, 4); scene.add(goldFill);
const silverFill = new THREE.PointLight(0x9ba7b5, 16, 12); silverFill.position.set(-3, 3, -3); scene.add(silverFill);

const black = new THREE.MeshStandardMaterial({ color: 0x101216, metalness: .78, roughness: .29 });
const carbon = new THREE.MeshStandardMaterial({ color: 0x080a0d, metalness: .58, roughness: .42 });
const gold = new THREE.MeshStandardMaterial({ color: 0xc39b36, metalness: .82, roughness: .24 });
const goldBright = new THREE.MeshStandardMaterial({ color: 0xf1d47c, metalness: .74, roughness: .2 });
const silver = new THREE.MeshStandardMaterial({ color: 0xb9c0c8, metalness: .86, roughness: .22 });
const tire = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: .88 });
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x454b53, metalness: .8, roughness: .35 });
const suitBlack = new THREE.MeshStandardMaterial({ color: 0x111419, metalness: .18, roughness: .7 });
const skin = new THREE.MeshStandardMaterial({ color: 0xb77e5b, roughness: .8 });
const hair = new THREE.MeshStandardMaterial({ color: 0x171513, roughness: .9 });

function mesh(geometry, material, parent, position=[0,0,0], rotation=[0,0,0]) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...position); m.rotation.set(...rotation); m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}
function beam(parent, a, b, radius, material, radial=8) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const direction = new THREE.Vector3().subVectors(end, start);
  const m = mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), radial), material, parent);
  m.position.copy(start).add(end).multiplyScalar(.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), direction.normalize());
  return m;
}
function box(parent, size, material, pos, rot=[0,0,0]) {
  return mesh(new THREE.BoxGeometry(...size), material, parent, pos, rot);
}
function makePanel(parent, points, material, depth=.08) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i=1;i<points.length;i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled:true, bevelSegments:2, steps:1, bevelSize:.035, bevelThickness:.035 });
  geo.computeVertexNormals();
  return mesh(geo, material, parent);
}

const carRig = new THREE.Group(); scene.add(carRig);
const car = new THREE.Group(); carRig.add(car);

// 2026-regulation-inspired survival cell and narrow, elongated nose.
const tub = new THREE.Group(); car.add(tub);
const hullPoints = [
  [2.95,.64,.12],[2.2,.72,.25],[1.2,.83,.39],[.25,.92,.48],[-.55,.94,.47],[-1.25,.86,.39],[-2.0,.78,.3]
];
const hullGeo = new THREE.BufferGeometry();
const verts=[], indices=[];
const sides=10;
for (let i=0;i<hullPoints.length;i++) {
  const [x,y,w]=hullPoints[i];
  for(let j=0;j<sides;j++){
    const a=(j/sides)*Math.PI*2;
    verts.push(x, y + Math.sin(a)*w*.58, Math.cos(a)*w);
  }
}
for(let i=0;i<hullPoints.length-1;i++) for(let j=0;j<sides;j++){
  const a=i*sides+j,b=i*sides+(j+1)%sides,c=(i+1)*sides+(j+1)%sides,d=(i+1)*sides+j;
  indices.push(a,d,b,b,d,c);
}
hullGeo.setAttribute("position",new THREE.Float32BufferAttribute(verts,3)); hullGeo.setIndex(indices); hullGeo.computeVertexNormals();
mesh(hullGeo, silver, tub);

// Carbon floor and sculpted sidepods.
box(car,[4.15,.12,1.72],carbon,[-.05,.34,0]);
for(const side of [-1,1]){
  const pod=makePanel(car,[[1.0,.48],[.62,1.0],[-.95,1.02],[-1.35,.56],[-.92,.4],[.48,.4]],black,.55);
  pod.position.z=side*.48; pod.rotation.y=side===1?0:Math.PI;
  const accent=makePanel(car,[[.72,.72],[.42,.84],[-.72,.85],[-1.05,.61],[-.72,.56],[.4,.57]],gold,.018);
  accent.position.z=side*.77; accent.rotation.y=side===1?0:Math.PI;
  const sill=box(car,[1.5,.055,.045],silver,[-.18,.49,side*.79],[0,0,-.08]);
  // Inset cooling louvres.
  for(let i=0;i<5;i++) box(car,[.055,.018,.28],darkMetal,[-.55+i*.12,.96,side*.73],[0,0,-.12]);
}
// Cockpit, seat and headrest.
mesh(new THREE.CylinderGeometry(.39,.48,.5,12),carbon,car,[-.48,1.03,0],[Math.PI/2,0,0]);
mesh(new THREE.BoxGeometry(.44,.12,.52),black,car,[-.35,1.13,0]);
mesh(new THREE.BoxGeometry(.26,.42,.36),carbon,car,[-.93,1.02,0]);
mesh(new THREE.TorusGeometry(.32,.035,8,28),darkMetal,car,[-.24,1.38,0],[Math.PI/2,0,0]);
// Air intake behind cockpit.
mesh(new THREE.CylinderGeometry(.24,.34,.48,12),black,car,[-1.35,1.18,0],[0,0,Math.PI/2]);
mesh(new THREE.CylinderGeometry(.16,.16,.03,12),gold,car,[-1.11,1.2,0],[0,0,Math.PI/2]);
// Halo, supports and mirrors.
beam(car,[-.05,1.26,-.36],[.36,1.52,-.36],.035,silver);
beam(car,[.36,1.52,-.36],[.42,1.55,.36],.035,silver);
beam(car,[.42,1.55,.36],[-.05,1.26,.36],.035,silver);
beam(car,[.42,1.55,0],[.56,1.1,0],.035,gold);
for(const side of [-1,1]){
  beam(car,[.35,1.15,side*.43],[.65,1.32,side*.72],.025,silver);
  mesh(new THREE.BoxGeometry(.2,.08,.12),black,car,[.69,1.33,side*.75]);
}
// 2026-style front wing: broad, low, multi-element.
for(let i=0;i<3;i++){
  const wing=box(car,[.42,.045,2.42-i*.12],i===1?gold:black,[3.02-i*.12,.34+i*.045,0],[0,0,(i-1)*-.025]);
}
for(const side of [-1,1]){
  box(car,[.12,.42,.42],silver,[3.18,.48,side*1.16],[0,0,-.08]);
  beam(car,[2.58,.35,side*.84],[2.9,.88,side*.34],.018,darkMetal);
  beam(car,[2.52,.35,side*.84],[2.76,.88,side*.34],.018,silver);
}
// Rear wing, pylons and end plates.
box(car,[.36,.06,1.78],black,[-2.25,1.43,0],[0,0,.02]);
box(car,[.29,.06,1.7],gold,[-2.18,1.55,0],[0,0,.015]);
for(const side of [-1,1]) box(car,[.08,.48,.42],silver,[-2.25,1.35,side*.91]);
beam(car,[-1.94,.72,-.16],[-2.13,1.42,-.16],.045,silver);
beam(car,[-1.94,.72,.16],[-2.13,1.42,.16],.045,silver);

// Wheels, gold wheel lips, brakes and suspension wishbones.
const wheels=[];
for(const x of [1.72,-1.68]) for(const z of [-1.02,1.02]){
  const wheelGroup=new THREE.Group(); wheelGroup.position.set(x,.48,z); car.add(wheelGroup); wheels.push(wheelGroup);
  mesh(new THREE.CylinderGeometry(.49,.49,.3,32),tire,wheelGroup,[0,0,0],[Math.PI/2,0,0]);
  mesh(new THREE.CylinderGeometry(.29,.29,.315,32),darkMetal,wheelGroup,[0,0,0],[Math.PI/2,0,0]);
  mesh(new THREE.CylinderGeometry(.235,.235,.32,32),silver,wheelGroup,[0,0,0],[Math.PI/2,0,0]);
  mesh(new THREE.CylinderGeometry(.16,.16,.325,24),black,wheelGroup,[0,0,0],[Math.PI/2,0,0]);
  mesh(new THREE.TorusGeometry(.455,.018,8,40),gold,wheelGroup,[0,0,0],[Math.PI/2,0,0]);
  for(let k=0;k<8;k++){
    const a=k*Math.PI/4;
    beam(wheelGroup,[Math.cos(a)*.08,-.17,Math.sin(a)*.08],[Math.cos(a)*.25,-.17,Math.sin(a)*.25],.018,silver,6);
  }
  const front=x>0;
  beam(car,[x+(front?-.25:.25),.55,z*.72],[x,.52,z],.022,silver);
  beam(car,[x+(front?.25:-.25),.34,z*.7],[x,.46,z],.022,darkMetal);
}
// Rear diffuser details.
for(let z=-.45;z<=.46;z+=.3) box(car,[.5,.1,.035],darkMetal,[-1.92,.27,z]);

// Sponsor artwork as real scene textures, with the supplied Vreeo mark included.
function sponsorTexture(){
  const c=document.createElement("canvas"); c.width=1024;c.height=512;
  const x=c.getContext("2d");
  x.fillStyle="#101216";x.fillRect(0,0,1024,512);
  x.fillStyle="#c8a344";x.fillRect(0,0,1024,18);
  x.fillStyle="#d4d8dc";x.font="900 116px Arial";x.fillText("VREEO",48,170);
  x.fillStyle="#f0d27b";x.font="bold 42px Arial";x.fillText("MOTORSPORT SYSTEMS",52,228);
  x.fillStyle="#b8bec7";x.font="bold 46px Arial";x.fillText("CALERIS",52,330);
  x.fillStyle="#c39b36";x.fillRect(52,365,780,9);
  x.fillStyle="#e1e4e8";x.font="bold 34px Arial";x.fillText("APEX  /  GRIDLINE  /  TORQUE",52,430);
  const vreeoMark=new Image();
  vreeoMark.onload=()=>{x.drawImage(vreeoMark,670,72,300,300);sponsorMap.needsUpdate=true;};
  vreeoMark.src="/assets/Untitled%20design_20261103_142659_0000.png";
  return new THREE.CanvasTexture(c);
}
const sponsorMap=sponsorTexture();
const decalMat=new THREE.MeshBasicMaterial({map:sponsorMap,transparent:false,side:THREE.DoubleSide});
for(const side of [-1,1]){
  const decal=mesh(new THREE.PlaneGeometry(.94,.38),decalMat,car,[-.28,.78,side*.775],[0,side===1?0:Math.PI,0]);
  decal.rotation.y=side===1?0:Math.PI;
}
const noseMark=mesh(new THREE.PlaneGeometry(.5,.13),new THREE.MeshBasicMaterial({map:sponsorMap,side:THREE.DoubleSide}),car,[1.75,.88,0],[0,0,0]);\nbox(car,[3.55,.025,.055],goldBright,[.38,1.02,0]);\nbox(car,[.78,.025,.045],silver,[-1.52,1.57,0]);

// Two fictional team drivers, standing with folded arms like the supplied pose reference.
function makeDriver(accent, sideIndex){
  const group=new THREE.Group();
  const body=new THREE.Group(); group.add(body);
  const team=new THREE.MeshStandardMaterial({color:0x101216,roughness:.68,metalness:.22});
  const panel=new THREE.MeshStandardMaterial({color:accent,roughness:.38,metalness:.5});
  const pants=new THREE.MeshStandardMaterial({color:0x0b0d10,roughness:.82});
  const face=new THREE.MeshStandardMaterial({color:sideIndex===0?0xb87c58:0x9b6449,roughness:.85});
  // Legs and torso.
  mesh(new THREE.CapsuleGeometry(.16,.58,4,8),pants,body,[-.13,-.42,0]);
  mesh(new THREE.CapsuleGeometry(.16,.58,4,8),pants,body,[.13,-.42,0]);
  mesh(new THREE.CapsuleGeometry(.34,.72,6,12),team,body,[0,.48,0]);
  // Shoulder and chest panels.
  mesh(new THREE.BoxGeometry(.62,.18,.36),panel,body,[0,.76,.015]);
  mesh(new THREE.BoxGeometry(.13,.58,.365),panel,body,[sideIndex===0?-.24:.24,.42,.012],[0,0,sideIndex===0?-.12:.12]);
  // Neck and head.
  mesh(new THREE.CylinderGeometry(.105,.13,.18,12),face,body,[0,.99,0]);
  mesh(new THREE.SphereGeometry(.245,18,14),face,body,[0,1.25,0]);
  mesh(new THREE.SphereGeometry(.25,16,10,0,Math.PI*2,0,Math.PI*.55),hair,body,[0,1.34,-.035]);
  // Ears, nose, eyes.
  for(const s of [-1,1]){
    mesh(new THREE.SphereGeometry(.045,8,8),face,body,[s*.245,1.24,0]);
    mesh(new THREE.SphereGeometry(.018,8,8),black,body,[s*.075,1.28,.224]);
  }
  mesh(new THREE.ConeGeometry(.045,.11,8),face,body,[0,1.2,.25],[Math.PI/2,0,0]);
  // Crossed forearms in front of the chest.
  beam(body,[-.48,.68,.14],[.36,.36,.36],.105,team);
  beam(body,[.48,.68,.14],[-.36,.36,.37],.105,team);
  mesh(new THREE.SphereGeometry(.105,10,8),face,body,[.36,.36,.36]);
  mesh(new THREE.SphereGeometry(.105,10,8),face,body,[-.36,.36,.37]);
  // Gold/silver sleeve stripes and chest badge.
  beam(body,[-.27,.57,.245],[-.08,.47,.33],.018,panel);
  beam(body,[.27,.57,.245],[.08,.47,.33],.018,silver);
  const badge=mesh(new THREE.PlaneGeometry(.22,.12),new THREE.MeshBasicMaterial({map:sponsorMap,side:THREE.DoubleSide}),body,[0,.66,.355]);
  badge.rotation.x=0;
  group.userData.body=body;
  group.userData.phase=sideIndex*1.8;
  return group;
}
const drivers=new THREE.Group(); scene.add(drivers);
const driverA=makeDriver(0xc49c3d,0), driverB=makeDriver(0xc6cbd0,1);
driverA.position.set(-2.62,0,-.82); driverB.position.set(-2.82,0,.85);
driverA.scale.setScalar(.83); driverB.scale.setScalar(.83);
driverA.rotation.y=.16; driverB.rotation.y=-.14;
drivers.add(driverA,driverB);

// Animated circuit ribbons and moving track lights.
const trackGroup=new THREE.Group(); scene.add(trackGroup);
const trackPoints=[
  new THREE.Vector3(-7,.015,-2.9),new THREE.Vector3(-4,.015,-4.1),
  new THREE.Vector3(1,.015,-4.25),new THREE.Vector3(5,.015,-2.7),
  new THREE.Vector3(6.3,.015,.4),new THREE.Vector3(3.7,.015,3.7),
  new THREE.Vector3(-1,.015,4.0),new THREE.Vector3(-5.8,.015,2.2),
  new THREE.Vector3(-7,.015,-2.9)
];
const circuitCurve=new THREE.CatmullRomCurve3(trackPoints,true,"catmullrom",.45);
const circuitGeo=new THREE.BufferGeometry().setFromPoints(circuitCurve.getPoints(180));
const circuitLine=new THREE.Line(circuitGeo,new THREE.LineBasicMaterial({color:0x96752c,transparent:true,opacity:.55}));
trackGroup.add(circuitLine);
const innerCurve=new THREE.CatmullRomCurve3(trackPoints.map((p)=>new THREE.Vector3(p.x*.86,.02,p.z*.86)),true);
trackGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(innerCurve.getPoints(180)),new THREE.LineBasicMaterial({color:0x8c929c,transparent:true,opacity:.18})));
const lightDots=[];
for(let i=0;i<3;i++){
  const dot=mesh(new THREE.SphereGeometry(.055,10,8),new THREE.MeshBasicMaterial({color:i===1?0xd8c17b:0xb6c0ce}),trackGroup);
  lightDots.push(dot);
}
const ground=mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshStandardMaterial({color:0x080a0d,roughness:1,metalness:0,transparent:true,opacity:.22}),scene,[0,-.045,0],[-Math.PI/2,0,0]);
ground.receiveShadow=true;

const clock=new THREE.Clock();
const reduceMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let raf=0;
function resize(){
  const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);
  camera.aspect=w/h;
  if(w<600){camera.fov=43;camera.position.set(3.9,4.25,12.7);camera.lookAt(-.35,1.15,0);}
  else {camera.fov=34;camera.position.set(5.7,4.2,9.2);camera.lookAt(-.1,.9,0);}
  camera.updateProjectionMatrix();renderer.setSize(w,h,false);
}
const observer=new ResizeObserver(resize); observer.observe(host); resize();

function animate(){
  raf=requestAnimationFrame(animate);
  const delta=Math.min(clock.getDelta(),.04),t=clock.elapsedTime;
  if(!reduceMotion){
    carRig.position.y=.035*Math.sin(t*.78);
    carRig.rotation.y=.052*Math.sin(t*.28);
    car.rotation.y+=delta*Math.PI/60;
    driverA.position.y=.025*Math.sin(t*1.05);
    driverB.position.y=.025*Math.sin(t*1.05+1.8);
    driverA.rotation.z=.012*Math.sin(t*.8);
    driverB.rotation.z=.012*Math.sin(t*.8+1.8);
    trackGroup.rotation.y=.018*Math.sin(t*.16);
    lightDots.forEach((dot,i)=>dot.position.copy(circuitCurve.getPoint((t*.025+i/3)%1)));
    goldFill.intensity=25+3*Math.sin(t*.7);
  }
  renderer.render(scene,camera);
}
animate();
document.addEventListener("visibilitychange",()=>{if(document.hidden)cancelAnimationFrame(raf);else if(!reduceMotion)animate();});
window.addEventListener("pagehide",()=>{cancelAnimationFrame(raf);observer.disconnect();renderer.dispose();});
