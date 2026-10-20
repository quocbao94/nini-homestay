import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';

let probeH = null, probePt = null;
const fmt = (v, d = 1) => v.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d });
const isMobile = matchMedia('(max-width: 760px)').matches || /Mobi|Android/i.test(navigator.userAgent);

// ---------- renderer / scene ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.7;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb9c9d3, 700, 2600);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.5, 8000);
camera.position.set(-140, 150, 210);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-15, 63, 10);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 6;
controls.maxDistance = 1100;
// ?cam=x,y,z,tx,ty,tz : mo san mot goc nhin (de chia se)
const camQ = new URLSearchParams(location.search).get('cam');
if (camQ) { const v = camQ.split(',').map(Number); if (v.length === 6) { camera.position.set(v[0], v[1], v[2]); controls.target.set(v[3], v[4], v[5]); } }

// Blender (x,y,z, Z len) -> three (x, z, -y)
const b2t = (x, y, z) => new THREE.Vector3(x, z, -y);

// ---------- troi + nang ----------
const sky = new Sky(); sky.scale.setScalar(10000); scene.add(sky);
const su = sky.material.uniforms;
su.turbidity.value = 6; su.rayleigh.value = 1.6; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.8;
const sunDir = new THREE.Vector3();
function setSun(elevDeg, azDeg) {   // azimuth tinh tu Bac theo chieu kim dong ho
  const phi = THREE.MathUtils.degToRad(90 - elevDeg), theta = THREE.MathUtils.degToRad(180 - azDeg);
  sunDir.setFromSphericalCoords(1, phi, theta);
  su.sunPosition.value.copy(sunDir);
}
setSun(38, 112);
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x5a4a32, 0.9));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(isMobile ? 2048 : 4096, isMobile ? 2048 : 4096);
const sc = sun.shadow.camera; sc.left = -170; sc.right = 170; sc.top = 170; sc.bottom = -170; sc.near = 10; sc.far = 900;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.4;
scene.add(sun, sun.target);
const SITE = new THREE.Vector3(-15, 63, 10);
function placeSun() { sun.position.copy(SITE).addScaledVector(sunDir, 400); sun.target.position.copy(SITE); }
placeSun();

// ---------- nuoc ----------
function makeWaterNormals(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const h = (x, y) => {
    let v = 0;
    for (let k = 0; k < 6; k++) {
      const f = 2 ** k, a = 1 / (k + 1.5);
      v += a * Math.sin((x * Math.cos(k * 1.7) + y * Math.sin(k * 1.7)) * f * 2 * Math.PI / size * 3 + k * 1.3);
    }
    return v;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
    const n = new THREE.Vector3(-dx, -dy, 2).normalize(), i = (y * size + x) * 4;
    data[i] = (n.x * 0.5 + 0.5) * 255; data[i + 1] = (n.y * 0.5 + 0.5) * 255; data[i + 2] = (n.z * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true; return t;
}
const wn = makeWaterNormals(); wn.repeat.set(220, 220);
const wn2 = wn.clone(); wn2.repeat.set(90, 90);
const water = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshPhysicalMaterial({
  color: 0x0c3536, roughness: 0.06, metalness: 0, normalMap: wn, normalScale: new THREE.Vector2(0.35, 0.35),
  clearcoat: 1, clearcoatRoughness: 0.05, clearcoatNormalMap: wn2, clearcoatNormalScale: new THREE.Vector2(0.25, 0.25),
  transparent: true, opacity: 0.94, envMapIntensity: 0.55,
}));
water.rotation.x = -Math.PI / 2; water.receiveShadow = true;
scene.add(water);
// env map tu bau troi de mat nuoc phan chieu
const pmrem = new THREE.PMREMGenerator(renderer);
const skyScene = new THREE.Scene(); const sky2 = sky.clone(); skyScene.add(sky2);
scene.environment = pmrem.fromScene(skyScene, 0, 1, 20000).texture;
function setWater(h) { water.position.y = h; document.getElementById('wval').textContent = fmt(h) + ' m'; updateProbe(); }

// ---------- tai mo hinh ----------
const manager = new THREE.LoadingManager();
manager.onProgress = (_, a, b) => { document.getElementById('loadbar').style.width = (a / b * 100) + '%'; };
const loader = new GLTFLoader(manager);
const load = (u) => new Promise((res, rej) => loader.load(u, res, undefined, rej));
const groundMeshes = [], boundary = [];

const meta = await (await fetch('assets/scene.json')).json();
setWater(meta.water_level);
document.getElementById('water').value = meta.water_level;

const [terrain, buildings, ...treeModels] = await Promise.all([
  load('assets/terrain.glb'), load('assets/buildings.glb'),
  ...meta.tree_models.map((f) => load('assets/trees/' + f)),
]);
terrain.scene.traverse((o) => {
  if (o.isMesh) { o.receiveShadow = true; o.material.roughness = 1; o.material.metalness = 0; groundMeshes.push(o); }
});
scene.add(terrain.scene);
buildings.scene.traverse((o) => {
  if (/RanhGioi|Moc_/.test(o.name)) boundary.push(o);
  if (o.isMesh) {
    o.castShadow = true; o.receiveShadow = true;
    const m = o.material;
    if (m && m.transmission > 0) { m.transparent = true; m.opacity = 0.35; m.transmission = 0; }
  }
});
scene.add(buildings.scene);

// cay: InstancedMesh cho tung mau, mau la lech nhe tung cay
const byVar = meta.tree_models.map(() => []);
for (const t of meta.trees) byVar[t[3]].push(t);
const tmp = new THREE.Object3D(), col = new THREE.Color(), rnd = (s) => { const x = Math.sin(s * 127.1) * 43758.5453; return x - Math.floor(x); };
treeModels.forEach((g, vi) => {
  const list = byVar[vi]; if (!list.length) return;
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    const leaf = !!(o.material.map && o.material.map.format === THREE.RGBAFormat) || /La/.test(o.material.name);
    if (leaf) { o.material.alphaTest = 0.5; o.material.transparent = false; o.material.depthWrite = true; o.material.side = THREE.DoubleSide; o.material.color.setRGB(2.1, 2.2, 1.9); }
    o.material.roughness = 0.85; o.material.metalness = 0;
    const im = new THREE.InstancedMesh(o.geometry, o.material, list.length);
    im.castShadow = true; im.receiveShadow = leaf;
    list.forEach((t, i) => {
      tmp.position.copy(b2t(t[0], t[1], t[2])); tmp.rotation.set(0, t[5], 0); tmp.scale.setScalar(t[4]); tmp.updateMatrix();
      im.setMatrixAt(i, tmp.matrix.clone().multiply(o.matrixWorld));
      const k = 0.82 + rnd(i + vi * 999) * 0.36; col.setRGB(k, k * (0.95 + rnd(i * 3.1) * 0.1), k * 0.95);
      im.setColorAt(i, leaf ? col : col.setRGB(1, 1, 1));
    });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    scene.add(im);
  });
});

const L = document.getElementById('loading'); L.style.opacity = 0; setTimeout(() => L.remove(), 700);

// ---------- giao dien ----------
const panel = document.getElementById('panel');
function setMode(m) {
  document.querySelectorAll('.modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  panel.classList.toggle('hidden', m !== 'noibo');
  boundary.forEach((o) => (o.visible = m === 'noibo' && document.getElementById('showBound').checked));
  history.replaceState(null, '', m === 'noibo' ? '#noibo' : '#');
}
document.querySelectorAll('.modes button').forEach((b) => b.onclick = () => setMode(b.dataset.mode));
document.getElementById('showBound').onchange = (e) => boundary.forEach((o) => (o.visible = e.target.checked));
document.getElementById('water').oninput = (e) => setWater(parseFloat(e.target.value));
setMode(location.hash === '#noibo' ? 'noibo' : 'khach');

// do cao do khi bam
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let down = null;
const marker = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xe0b25c }));
marker.visible = false; scene.add(marker);
renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || panel.classList.contains('hidden')) return;
  ptr.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObjects(groundMeshes, false)[0];
  if (!hit) return;
  probePt = hit.point; probeH = hit.point.y; marker.position.copy(hit.point); marker.visible = true; updateProbe();
});
function updateProbe() {
  if (probeH == null) return;
  const w = water.position.y, E = meta.origin_utm48n[0] + probePt.x, N = meta.origin_utm48n[1] - probePt.z;
  const st = probeH <= w ? `<span style="color:#7fd3ff">Đang ngập ${fmt(w - probeH, 2)} m</span>` : `Cao hơn mặt nước ${fmt(probeH - w, 2)} m`;
  document.getElementById('probe').innerHTML = `Cao độ: <b>${fmt(probeH, 2)} m</b> · ${st}<br><small>UTM 48N: E ${fmt(E, 1)} · N ${fmt(N, 1)}</small>`;
}

// ---------- vong lap ----------
const clock = new THREE.Clock();
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta(); wn.offset.x += dt * 0.004; wn.offset.y += dt * 0.0025; wn2.offset.x -= dt * 0.003;
  controls.update();
  renderer.render(scene, camera);
});
