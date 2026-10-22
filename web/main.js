import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';
import SunCalc from 'https://cdn.jsdelivr.net/npm/suncalc@1.9.0/+esm';
import { buildContext } from './context.js';

let probeH = null, probePt = null;
const uWater = { value: 61.6 };
let updateFlood = () => {};
let CTX = null;
const coreGroup = new THREE.Group(); coreGroup.name = 'VungLoi_GLB';
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
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1.0, 8000);
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
let realLevel = 61.6;
const EX = () => (CTX ? CTX.exaggeration : 1), REF = 61.5;
const toDisp = (h) => REF + (h - REF) * EX(), toReal = (y) => REF + (y - REF) / EX();
function setWater(h) {
  realLevel = h; water.position.y = toDisp(h); uWater.value = water.position.y;
  document.getElementById('wval').textContent = fmt(h, 2) + ' m';
  document.getElementById('water').value = h;
  document.getElementById('nodata').classList.toggle('hidden', h >= 61.5);
  document.querySelectorAll('.presets button').forEach((b) => b.classList.toggle('on', Math.abs(+b.dataset.h - h) < 0.03));
  updateFlood(h); updateProbe(); if (CTX) CTX.onWater();
}

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
function shoreShader(m) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWater = uWater;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWY;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWY;\nuniform float uWater;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float d = vWY - uWater;
        float wet = 1.0 - smoothstep(0.0, 0.9, d);            // dai dat uot sat mep nuoc
        diffuseColor.rgb *= mix(1.0, 0.55, wet * step(0.0, d));
        float fw = max(fwidth(d) * 1.5, 0.015);
        float foam = (1.0 - smoothstep(0.0, fw, abs(d))) * step(-0.05, d);      // vien bot mong, do rong theo pixel
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 0.97), foam * 0.8);`);
  };
  m.needsUpdate = true;
}
let siteTris = null;
terrain.scene.traverse((o) => {
  if (!o.isMesh) return;
  o.receiveShadow = true; o.material.roughness = 1; o.material.metalness = 0; shoreShader(o.material); groundMeshes.push(o);
  if (/KhuDat/.test(o.name)) {           // tam giac dat trong ranh -> tinh dien tich ngap
    o.updateWorldMatrix(true, false);
    const g = o.geometry, p = g.attributes.position, idx = g.index, n = idx ? idx.count : p.count;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), area = [], cy = [];
    for (let i = 0; i < n; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(p, ia).applyMatrix4(o.matrixWorld); b.fromBufferAttribute(p, ib).applyMatrix4(o.matrixWorld); c.fromBufferAttribute(p, ic).applyMatrix4(o.matrixWorld);
      area.push(new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length() / 2);
      cy.push(Math.min(a.y, b.y, c.y));
    }
    siteTris = { area: Float32Array.from(area), y: Float32Array.from(cy), total: area.reduce((s, v) => s + v, 0) };
  }
});
let satMesh = null;
terrain.scene.traverse((o) => { if (o.isMesh && /BoiCanh/.test(o.name)) satMesh = o; });
coreGroup.add(terrain.scene);
scene.add(coreGroup);
buildings.scene.traverse((o) => {
  if (/RanhGioi|Moc_/.test(o.name)) boundary.push(o);
  if (o.isMesh) {
    o.castShadow = true; o.receiveShadow = true;
    const m = o.material;
    if (m && m.transmission > 0) { m.transparent = true; m.opacity = 0.35; m.transmission = 0; }
  }
});
coreGroup.add(buildings.scene);
const NAMES = { NhaChinh: 'Nhà chính', Toilet: 'Khu toilet' };
const structures = [];
buildings.scene.updateMatrixWorld(true);
buildings.scene.traverse((o) => {
  if (/^(NhaChinh|Toilet|San\d+)$/.test(o.name)) {
    const v = new THREE.Vector3(); o.getWorldPosition(v);
    structures.push({ name: NAMES[o.name] || o.name.replace(/^San0*(\d+)/, 'Sàn lều $1'), floor: v.y });
  }
});
structures.sort((p, q) => p.floor - q.floor);
updateFlood = (h) => {
  let html = '';
  if (siteTris) {
    let f = 0; for (let i = 0; i < siteTris.y.length; i++) if (siteTris.y[i] < h) f += siteTris.area[i];
    const pct = f / siteTris.total * 100;
    html += `Đất trong ranh bị ngập: <b>${fmt(f, 0)} m²</b> / ${fmt(siteTris.total, 0)} m² (${fmt(pct, 1)}%)<div class="bar"><i style="width:${Math.min(100, pct)}%"></i></div>`;
  }
  html += '<ul>' + structures.map((st) => {
    const dz = st.floor - h, cls = dz < 0 ? 'wet' : dz < 0.5 ? 'risk' : 'ok';
    const t = dz < 0 ? `ngập ${fmt(-dz, 2)} m` : `sàn cao hơn nước ${fmt(dz, 2)} m`;
    return `<li><span>${st.name}</span><span class="${cls}">${t}</span></li>`;
  }).join('') + '</ul>';
  document.getElementById('flood').innerHTML = html;
};

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
    coreGroup.add(im);
  });
});

// ---------- boi canh tu dong (low-poly) ----------
CTX = await buildContext({ scene, uWater, shoreShader });
groundMeshes.push(CTX.terrain);
const wIn = document.getElementById('water'); wIn.min = CTX.water.min; wIn.max = CTX.water.max;
function setStyle(st) {
  const lp = st === 'lowpoly';
  CTX.root.visible = lp; if (satMesh) satMesh.visible = !lp;
  scene.fog.color.set(lp ? 0xcfe0e6 : 0xb9c9d3);
  document.querySelectorAll('.style button').forEach((b) => b.classList.toggle('on', b.dataset.style === st));
}
document.querySelectorAll('.style button').forEach((b) => b.onclick = () => setStyle(b.dataset.style));
setStyle('lowpoly');
const exIn = document.getElementById('exag'); exIn.value = CTX.exaggeration;
exIn.oninput = () => {
  const k = +exIn.value; CTX.setExaggeration(k); document.getElementById('exagv').textContent = '×' + fmt(k, 1);
  coreGroup.position.y = (k - 1) * (63.5 - CTX.ref);       // vung loi nang theo dia hinh da phong dai
  setWater(realLevel);
};
// mat troi theo ngay/gio (SunCalc), mui gio +7
const [cLat, cLon] = meta.center_latlon || [11.1712, 107.0924];
const dIn = document.getElementById('sunDate'), tIn = document.getElementById('sunTime');
dIn.value = CTX.sun.date; tIn.value = (([h, m]) => +h + m / 60)(CTX.sun.time.split(':').map(Number));
const hemi = scene.children.find((o) => o.isHemisphereLight);
function updateSunCalc() {
  const hh = +tIn.value, d = new Date(dIn.value + 'T00:00:00+07:00'); d.setTime(d.getTime() + hh * 3600e3);
  const p = SunCalc.getPosition(d, cLat, cLon);
  const elev = THREE.MathUtils.radToDeg(p.altitude), az = (THREE.MathUtils.radToDeg(p.azimuth) + 180 + 360) % 360;
  setSun(Math.max(elev, -4), az); placeSun();
  const day = THREE.MathUtils.clamp((elev + 2) / 12, 0, 1);
  sun.intensity = 2.6 * day; hemi.intensity = 0.15 + 0.75 * day; renderer.toneMappingExposure = 0.35 + 0.35 * day;
  sun.color.setHSL(0.1, 0.6, 0.55 + 0.4 * THREE.MathUtils.clamp(elev / 30, 0, 1));
  document.getElementById('sunv').textContent = `${String(Math.floor(hh)).padStart(2, '0')}:${String(Math.round((hh % 1) * 60)).padStart(2, '0')} · cao ${fmt(elev, 0)}° · hướng ${fmt(az, 0)}°`;
}
dIn.oninput = tIn.oninput = updateSunCalc; updateSunCalc(); exIn.oninput();
// nhan dia danh (HTML theo diem 3D)
const labelEls = CTX.labels.map((l) => { const e = document.createElement('div'); e.className = 'maplabel'; e.textContent = l.text; document.body.appendChild(e); return { e, p: new THREE.Vector3(l.x, CTX.heightAt(l.x, l.y) + 15, -l.y) }; });
const _v = new THREE.Vector3();
window.__drawLabels = () => labelEls.forEach(({ e, p }) => { _v.copy(p).project(camera); const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1; e.style.display = vis ? 'block' : 'none'; e.style.transform = `translate(-50%,-50%) translate(${(_v.x + 1) / 2 * innerWidth}px,${(1 - _v.y) / 2 * innerHeight}px)`; });
document.getElementById('attr').textContent = CTX.attribution;
console.log('BoiCanh', CTX.stats);
setWater(meta.water_level);
const L = document.getElementById('loading'); L.style.opacity = 0; setTimeout(() => L.remove(), 700);

// ---------- giao dien ----------
const panel = document.getElementById('panel');
function setMode(m) {
  document.querySelectorAll('.modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  document.body.classList.toggle('noibo', m === 'noibo');
  boundary.forEach((o) => (o.visible = m === 'noibo' && document.getElementById('showBound').checked));
  history.replaceState(null, '', m === 'noibo' ? '#noibo' : '#');
}
document.querySelectorAll('.modes button').forEach((b) => b.onclick = () => setMode(b.dataset.mode));
document.getElementById('showBound').onchange = (e) => boundary.forEach((o) => (o.visible = e.target.checked));
document.getElementById('water').oninput = (e) => { stopPlay(); setWater(parseFloat(e.target.value)); };
setMode(location.hash === '#noibo' ? 'noibo' : 'khach');
document.querySelectorAll('.presets button').forEach((b) => b.onclick = () => { stopPlay(); setWater(+b.dataset.h); });
let playing = false, dir = 1;
const playBtn = document.getElementById('play');
function stopPlay() { playing = false; playBtn.classList.remove('on'); playBtn.textContent = '▶'; }
playBtn.onclick = () => { playing = !playing; playBtn.classList.toggle('on', playing); playBtn.textContent = playing ? '❚❚' : '▶'; };
document.getElementById('fold').onclick = (e) => { const f = panel.classList.toggle('folded'); e.target.textContent = f ? '+' : '–'; };
if (isMobile) { panel.classList.add('folded'); document.getElementById('fold').textContent = '+'; }

// do cao do khi bam
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let down = null;
const marker = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xe0b25c }));
marker.visible = false; scene.add(marker);
renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || !document.body.classList.contains('noibo')) return;
  ptr.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObjects(groundMeshes, false)[0];
  if (!hit) return;
  probePt = hit.point; probeH = hit.object === (CTX && CTX.terrain) ? toReal(hit.point.y) : hit.point.y; marker.position.copy(hit.point); marker.visible = true; updateProbe();
});
function updateProbe() {
  if (probeH == null) return;
  const w = realLevel, E = meta.origin_utm48n[0] + probePt.x, N = meta.origin_utm48n[1] - probePt.z;
  const st = probeH <= w ? `<span style="color:#7fd3ff">Đang ngập ${fmt(w - probeH, 2)} m</span>` : `Cao hơn mặt nước ${fmt(probeH - w, 2)} m`;
  document.getElementById('probe').innerHTML = `Cao độ: <b>${fmt(probeH, 2)} m</b> · ${st}<br><small>UTM 48N: E ${fmt(E, 1)} · N ${fmt(N, 1)}</small>`;
}

// ---------- vong lap ----------
const clock = new THREE.Clock();
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (playing) {   // dao dong 58 <-> 64 m, khoang 0.8 m/giay
    let h = realLevel + dir * dt * 0.8;
    if (h > 64) { h = 64; dir = -1; } if (h < 58) { h = 58; dir = 1; }
    setWater(h);
  } wn.offset.x += dt * 0.004; wn.offset.y += dt * 0.0025; wn2.offset.x -= dt * 0.003;
  controls.update(); if (window.__drawLabels) window.__drawLabels();
  renderer.render(scene, camera);
});
