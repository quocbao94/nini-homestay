// Boi canh 3D tu dong (low-poly kieu Tiny Map) tu du lieu tinh trong public/data/
// Toa do du lieu: met cuc bo (x = Dong, y = Bac); three.js: (x, cao do, -y)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DATA = 'public/data/';
const getJSON = (f) => fetch(DATA + f).then((r) => r.json());
const rnd = (s) => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function pip(pt, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; }
function inPoly(pt, g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.some((p) => pip(pt, p[0]) && !p.slice(1).some((h) => pip(pt, h)));
}
function distToRing(pt, ring) {
  let d = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[i + 1], dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((pt[0] - ax) * dx + (pt[1] - ay) * dy) / (dx * dx + dy * dy || 1)));
    d = Math.min(d, Math.hypot(pt[0] - ax - t * dx, pt[1] - ay - t * dy));
  }
  return d;
}

export async function buildContext({ scene, uWater, shoreShader, ref = 61.5 }) {
  const [meta, ctx, roads, water, land, bld, trees, core] = await Promise.all([
    getJSON('terrain.json'), getJSON('context.json'), getJSON('roads.geojson'), getJSON('water.geojson'),
    getJSON('landcover.geojson'), getJSON('buildings.geojson'), getJSON('trees.geojson'), getJSON('core.geojson')]);
  const H = new Float32Array(await (await fetch(DATA + 'heightmap.f32')).arrayBuffer());
  const G = meta.width, sp = meta.spacing_m, [x0, , , y1] = meta.extent_local_m;
  const coreRing = core.features[0].geometry.coordinates[0], coreBuf = core.features[0].properties.buffer_m || 0;
  // cao do song tuyen tinh tai (x,y) cuc bo
  const heightAt = (x, y) => {
    const fx = Math.min(G - 1.001, Math.max(0, (x - x0) / sp)), fy = Math.min(G - 1.001, Math.max(0, (y1 - y) / sp));
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, k = j * G + i;
    return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + G] * (1 - u) + H[k + G + 1] * u) * v;
  };
  let ex = ctx.vertical_exaggeration || 1;
  const Y = (h) => ref + (h - ref) * ex;            // phong dai cao do quanh mat chuan ho
  const root = new THREE.Group(); root.name = 'BoiCanh_TuDong'; scene.add(root);

  // ---------- dia hinh low-poly ----------
  const STEP = 2;                                   // lay 1/2 diem -> o 20 m cho dang low-poly
  const n = Math.floor((G - 1) / STEP) + 1;
  const geo = new THREE.PlaneGeometry((n - 1) * STEP * sp, (n - 1) * STEP * sp, n - 1, n - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), baseH = new Float32Array(pos.count);
  const cGrass = [new THREE.Color(0x8fbf5a), new THREE.Color(0x6fa64a), new THREE.Color(0xa6c46a)];
  const cForest = new THREE.Color(0x3f7d3a), cSand = new THREE.Color(0xe6d3a3), cRock = new THREE.Color(0x9b8f7a), cField = new THREE.Color(0xc9c27a);
  const forestPolys = land.features.filter((f) => /forest|wood|orchard|plantation|park|garden|scrub/.test(f.properties.kind));
  const lakePolys = water.features.filter((f) => /Polygon/.test(f.geometry.type));
  const fieldPolys = land.features.filter((f) => /farmland|meadow|grass/.test(f.properties.kind));
  const half = (n - 1) * STEP * sp / 2, offX = x0 + half, offZ = -(y1 - half);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const X = pos.getX(i) + offX, Zt = pos.getZ(i) + offZ, x = X, y = -Zt;
    let h = heightAt(x, y);
    const dc = distToRing([x, y], coreRing), inside = pip([x, y], coreRing);
    if (inside) h -= 0.35 * Math.min(1, dc / 4);   // ha nhe trong vung loi de mat dat GLB nam tren, vien noi muot
    // DEM khong co day ho (mat nuoc phang ~61.5 m): tao long ho gia sau dan tu bo vao de mat nuoc khong de len dat
    if (h < ref + 0.25 && lakePolys.some((f) => inPoly([x, y], f.geometry))) {
      const ds = Math.min(...lakePolys.map((f) => distToRing([x, y], (f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates[0])[0])));
      h -= Math.min(6, 0.6 + ds / 12);
    }    baseH[i] = h;
    const slope = Math.abs(heightAt(x + 10, y) - heightAt(x - 10, y)) + Math.abs(heightAt(x, y + 10) - heightAt(x, y - 10));
    c.copy(cGrass[Math.floor(rnd(i) * 3)]);
    if (fieldPolys.some((f) => inPoly([x, y], f.geometry))) c.lerp(cField, 0.6);
    if (forestPolys.some((f) => inPoly([x, y], f.geometry))) c.lerp(cForest, 0.75);
    if (slope > 6) c.lerp(cRock, Math.min(0.7, (slope - 6) / 10));
    if (h < ref + 1.2) c.lerp(cSand, Math.min(1, (ref + 1.2 - h) / 1.2));
    col.set([c.r, c.g, c.b], i * 3);
    pos.setX(i, X); pos.setZ(i, Zt);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const tMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
  shoreShader(tMat);
  const terrain = new THREE.Mesh(geo, tMat); terrain.receiveShadow = true; terrain.name = 'DiaHinh_TuDong'; root.add(terrain);

  // ---------- duong: dai bam dia hinh ----------
  const roadCol = { 1: 0xf2efe6, 2: 0xf2efe6, 3: 0xe9dcc0, 4: 0xd9c49a, 5: 0xcdb48a };
  const roadGeos = [], roadBase = [];
  for (const f of roads.features) {
    const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const w = f.properties.width || 4, cl = new THREE.Color(roadCol[f.properties.class] || 0xd9c49a);
    for (const ln of lines) {
      const pts = [];
      for (let k = 0; k < ln.length - 1; k++) {
        const [ax, ay] = ln[k], [bx, by] = ln[k + 1], L = Math.hypot(bx - ax, by - ay), m = Math.max(1, Math.ceil(L / 4));
        for (let s = 0; s < m; s++) pts.push([ax + (bx - ax) * s / m, ay + (by - ay) * s / m]);
      }
      pts.push(ln[ln.length - 1]);
      if (pts.length < 2) continue;
      const v = [], cc = [], idx = [], bh = [];
      pts.forEach((p, k) => {
        const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
        let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        for (const sgn of [1, -1]) {
          const x = p[0] - dy * w / 2 * sgn, y = p[1] + dx * w / 2 * sgn, h = heightAt(x, y) + 0.25;
          v.push(x, 0, -y); bh.push(h); cc.push(cl.r, cl.g, cl.b);
        }
        if (k > 0) { const o = (k - 1) * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); g.setIndex(idx);
      roadGeos.push(g); roadBase.push(bh);
    }
  }
  let roadMesh = null, roadH = null;
  if (roadGeos.length) {
    const g = mergeGeometries(roadGeos); roadH = Float32Array.from(roadBase.flat());
    roadMesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }));
    roadMesh.receiveShadow = true; roadMesh.name = 'Duong_TuDong'; root.add(roadMesh);
  }

  // ---------- nha: dun tu footprint ----------
  const wallCols = [0xf4efe6, 0xefe6d2, 0xe8dccb, 0xf1e9dc], roofCols = [0xc8643b, 0xb85a3a, 0x8f9aa3, 0x6d7a84, 0xd07a45];
  const bGeos = [], bBase = [];
  bld.features.forEach((f, id) => {
    const ring = (f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates[0])[0];
    if (!ring || ring.length < 4) return;
    const fl = f.properties.floors || (1 + Math.floor(rnd(id + 7) * 3));
    const hgt = f.properties.height || fl * 3.2;
    let hmin = Infinity; ring.forEach(([x, y]) => (hmin = Math.min(hmin, heightAt(x, y))));
    const shape = new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: hgt + 0.4, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);                                 // (x,y,z) -> (x, z, -y): day = 0, mai = hgt
    const wc = new THREE.Color(wallCols[id % wallCols.length]), rc = new THREE.Color(roofCols[Math.floor(rnd(id) * roofCols.length)]);
    g.computeVertexNormals();
    const p = g.attributes.position, nm = g.attributes.normal, cc = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const top = nm.getY(i) > 0.5; (top ? rc : wc).toArray(cc, i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    g.deleteAttribute('uv'); g.translate(0, -0.4, 0);
    bGeos.push(g); bBase.push({ n: p.count, h: hmin });
  });
  let bMesh = null, bH = null;
  if (bGeos.length) {
    const g = mergeGeometries(bGeos.map((q) => (q.index ? q.toNonIndexed() : q)));
    bH = new Float32Array(g.attributes.position.count); let o = 0;
    bGeos.forEach((q, k) => { const cnt = q.index ? q.index.count : q.attributes.position.count; bH.fill(bBase[k].h, o, o + cnt); o += cnt; });
    g.userData.y0 = Float32Array.from(g.attributes.position.array.filter((_, i) => i % 3 === 1));
    bMesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 }));
    bMesh.castShadow = bMesh.receiveShadow = true; bMesh.name = 'Nha_TuDong'; root.add(bMesh);
  }

  // ---------- cay: instancing trong vung rung/vuon (+ cay le OSM) ----------
  const treePts = [];
  for (const f of forestPolys) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const p of polys) {
      const xs = p[0].map((q) => q[0]), ys = p[0].map((q) => q[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const dens = /orchard|plantation/.test(f.properties.kind) ? 7 : 6;    // khoang cach luoi (m)
      for (let y = minY; y < maxY; y += dens) for (let x = minX; x < maxX; x += dens) {
        const s = x * 0.37 + y * 1.13, jx = x + (rnd(s) - 0.5) * dens * 0.8, jy = y + (rnd(s + 9) - 0.5) * dens * 0.8;
        if (!inPoly([jx, jy], f.geometry) || pip([jx, jy], coreRing) || distToRing([jx, jy], coreRing) < coreBuf) continue;
        treePts.push([jx, jy, rnd(s + 3)]);
      }
    }
  }
  for (const f of trees.features) treePts.push([...f.geometry.coordinates, rnd(f.geometry.coordinates[0])]);
  const crown = new THREE.IcosahedronGeometry(1, 0), cone = new THREE.ConeGeometry(1, 2.6, 6), trunk = new THREE.CylinderGeometry(0.12, 0.18, 1, 5);
  const mkI = (g, color, count) => { const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 }), count); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; root.add(m); return m; };
  const N = treePts.length;
  const iCrown = mkI(crown, 0xffffff, N), iTrunk = mkI(trunk, 0x6b4a32, N);
  const tColA = new THREE.Color(0x4f8f3a), tColB = new THREE.Color(0x2f6b2f), tmp = new THREE.Object3D(), tc = new THREE.Color();
  const treeBase = treePts.map(([x, y, r]) => ({ x, y, r, h: heightAt(x, y), s: 2.2 + r * 2.2 }));
  treeBase.forEach((t, i) => iCrown.setColorAt(i, tc.copy(tColA).lerp(tColB, t.r)));

  // ---------- nhan dia danh ----------
  const labels = [];
  const lake = water.features.find((f) => f.properties.name);
  if (lake) labels.push({ text: lake.properties.name, x: -250, y: -900 });

  // ---------- cap nhat cao do (phong dai) + an doi tuong duoi nuoc ----------
  function applyY() {
    for (let i = 0; i < pos.count; i++) pos.setY(i, Y(baseH[i]));
    pos.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
    if (roadMesh) { const p = roadMesh.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, Y(roadH[i])); p.needsUpdate = true; roadMesh.geometry.computeBoundingSphere(); }
    if (bMesh) { const p = bMesh.geometry.attributes.position, y0 = bMesh.geometry.userData.y0; for (let i = 0; i < p.count; i++) p.setY(i, Y(bH[i]) + y0[i]); p.needsUpdate = true; bMesh.geometry.computeBoundingSphere(); }
    updateTrees();
  }
  function updateTrees() {
    treeBase.forEach((t, i) => {
      const under = Y(t.h) < uWater.value - 0.3, s = under ? 0.0001 : t.s;
      tmp.position.set(t.x, Y(t.h) + s * 1.1 + 1, -t.y); tmp.scale.set(s, s * 1.15, s); tmp.rotation.set(0, t.r * 6.28, 0); tmp.updateMatrix(); iCrown.setMatrixAt(i, tmp.matrix);
      tmp.position.set(t.x, Y(t.h) + (s * 1.1 + 1) / 2, -t.y); tmp.scale.set(under ? 0.0001 : 1, s * 1.1 + 1, under ? 0.0001 : 1); tmp.updateMatrix(); iTrunk.setMatrixAt(i, tmp.matrix);
    });
    iCrown.instanceMatrix.needsUpdate = iTrunk.instanceMatrix.needsUpdate = true; if (iCrown.instanceColor) iCrown.instanceColor.needsUpdate = true;
  }
  applyY();
  return {
    root, terrain, heightAt, labels, ref,
    stats: { roads: roads.features.length, buildings: bGeos.length, trees: N, landcover: land.features.length, demSource: meta.source },
    setExaggeration(k) { ex = k; applyY(); },
    get exaggeration() { return ex; },
    onWater: updateTrees,
    attribution: ctx.attribution, water: ctx.water, sun: ctx.sun,
  };
}
