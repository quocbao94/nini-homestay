#!/usr/bin/env python3
"""Lay du lieu boi canh 1 lan, bake ra file tinh trong web/public/data/ (web KHONG goi API luc chay).
DEM: Copernicus GLO-30 qua OpenTopography (mac dinh) hoac AWS Terrarium. Ban do: OSM qua Overpass. Nha: Overture Maps (+ OSM bu).
Tat ca toa do xuat ra la met cuc bo (x=Dong, y=Bac), goc = origin_utm48n trong config.
Chay: python3 scripts/fetch_context.py [--skip-dem] [--skip-osm] [--skip-overture]
Can: numpy, pillow, shapely, overturemaps (pip install --user overturemaps shapely)."""
import io, json, math, os, sys, time, urllib.parse, urllib.request
import numpy as np
from PIL import Image
from shapely.geometry import LineString, Point, Polygon, MultiPolygon, mapping, shape
from shapely.ops import unary_union
sys.path.insert(0, os.path.dirname(__file__))
from geo import Local

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = json.load(open(os.path.join(ROOT, 'scripts', 'context.config.json'), encoding='utf-8'))
OUT = os.path.join(ROOT, 'web', 'public', 'data'); os.makedirs(OUT, exist_ok=True)
CACHE = os.path.join(ROOT, 'scripts', '.cache'); os.makedirs(CACHE, exist_ok=True)
L = Local(CFG['origin_utm48n'])
R = CFG['radius_km'] * 1000.0
UA = CFG['user_agent']
args = set(sys.argv[1:])

def http(url, data=None, tries=4):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={'User-Agent': UA})
            return urllib.request.urlopen(req, timeout=180).read()
        except Exception as e:
            print('  thu lai', k + 1, e); time.sleep(5 * (k + 1))
    raise RuntimeError('loi tai ' + url)

# ---- vung bao (lat/lon) tu tam + ban kinh ----
cx, cy = L.fwd(*CFG['center_latlon'])
corners = [L.inv(cx + sx * R, cy + sy * R) for sx in (-1, 1) for sy in (-1, 1)]
S, N = min(c[0] for c in corners), max(c[0] for c in corners)
W, E = min(c[1] for c in corners), max(c[1] for c in corners)
ext = (cx - R, cy - R, cx + R, cy + R)
print(f'Vung boi canh: tam ({cx:.1f},{cy:.1f}) m, R={R:.0f} m, bbox lat {S:.5f}..{N:.5f} lon {W:.5f}..{E:.5f}')

from shapely.geometry import box as _box
BOX = _box(*ext)
core = Polygon([L.fwd(*p) for p in CFG['core_polygon_latlon']])
core_buf = core.buffer(CFG.get('core_buffer_m', 0))

def save(name, obj):
    p = os.path.join(OUT, name); json.dump(obj, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'  -> {name}: {os.path.getsize(p)/1024:.0f} KB')

# =============== 1. DEM ===============
# source = "copernicus" (mac dinh, khop mo hinh Blender) | "aws-terrarium"
def bilinear(arr, fx, fy):
    i0 = np.clip(np.floor(fx).astype(int), 0, arr.shape[1] - 2); j0 = np.clip(np.floor(fy).astype(int), 0, arr.shape[0] - 2)
    u = fx - i0; v = fy - j0
    return (arr[j0, i0] * (1 - u) + arr[j0, i0 + 1] * u) * (1 - v) + (arr[j0 + 1, i0] * (1 - u) + arr[j0 + 1, i0 + 1] * u) * v

if '--skip-dem' not in args:
    src = CFG['dem'].get('source', 'copernicus')
    sp = CFG['dem']['grid_spacing_m']; G = int(round(2 * R / sp)) + 1
    xs = np.linspace(ext[0], ext[2], G); ys = np.linspace(ext[3], ext[1], G)   # hang 0 = phia Bac
    LL = np.array([[L.inv(xv, yv) for xv in xs] for yv in ys])                 # (G,G,2) lat,lon
    lat, lon = LL[..., 0], LL[..., 1]
    if src == 'copernicus':
        key_file = os.path.join(ROOT, '..', '.opentopo_key')
        key = os.environ.get('OPENTOPO_KEY') or open(key_file).read().strip()
        m = 0.003   # le them ~300 m de noi suy o bien
        cp = os.path.join(CACHE, 'cop30.asc')
        if not os.path.exists(cp):
            q = urllib.parse.urlencode(dict(demtype='COP30', south=S - m, north=N + m, west=W - m, east=E + m, outputFormat='AAIGrid', API_Key=key))
            open(cp, 'wb').write(http('https://portal.opentopography.org/API/globaldem?' + q))
        lines = open(cp).read().split('\n'); hd = {}; k = 0
        while lines[k].split()[0].lower() in ('ncols', 'nrows', 'xllcorner', 'yllcorner', 'cellsize', 'nodata_value'):
            a, b = lines[k].split()[:2]; hd[a.lower()] = float(b); k += 1
        nc, nr, cs = int(hd['ncols']), int(hd['nrows']), hd['cellsize']
        D = np.array(' '.join(lines[k:]).split(), np.float32).reshape(nr, nc)          # hang 0 = Bac
        fx = (lon - hd['xllcorner']) / cs - 0.5; fy = (nr - 1) - ((lat - hd['yllcorner']) / cs - 0.5)
        H = bilinear(D, fx, fy).astype(np.float32); srcname = 'Copernicus GLO-30 (OpenTopography)'
    else:
        z = CFG['dem']['zoom']; n = 2 ** z
        tx = lambda lo: (lo + 180) / 360 * n
        ty = lambda la: (1 - np.log(np.tan(np.radians(la)) + 1 / np.cos(np.radians(la))) / np.pi) / 2 * n
        tx0, ty0, tx1, ty1 = int(tx(W)), int(ty(N)), int(tx(E)), int(ty(S))
        mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), np.float32)
        for a in range(tx0, tx1 + 1):
            for b in range(ty0, ty1 + 1):
                cp = os.path.join(CACHE, f'terrarium_{z}_{a}_{b}.png')
                if not os.path.exists(cp):
                    open(cp, 'wb').write(http(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{a}/{b}.png'))
                im = np.asarray(Image.open(cp).convert('RGB')).astype(np.float32)
                mosaic[(b - ty0) * 256:(b - ty0 + 1) * 256, (a - tx0) * 256:(a - tx0 + 1) * 256] = im[..., 0] * 256 + im[..., 1] + im[..., 2] / 256 - 32768
        H = bilinear(mosaic, (tx(lon) - tx0) * 256 - 0.5, (ty(lat) - ty0) * 256 - 0.5).astype(np.float32)
        srcname = f'AWS Terrain Tiles (Terrarium) z{z}'
    H.astype('<f4').tofile(os.path.join(OUT, 'heightmap.f32'))
    save('terrain.json', {'width': G, 'height': G, 'spacing_m': sp, 'extent_local_m': ext, 'row0': 'north',
                          'min_m': float(H.min()), 'max_m': float(H.max()), 'source': srcname,
                          'bbox_latlon': [S, W, N, E], 'origin_utm48n': CFG['origin_utm48n'], 'format': 'float32 little-endian, row-major'})
    print(f'DEM [{srcname}]: {G}x{G} @ {sp} m, cao do {H.min():.1f}..{H.max():.1f} m')

# =============== 2. OSM qua Overpass ===============
def to_local_line(geom):
    return [L.fwd(p['lat'], p['lon']) for p in geom]

if '--skip-osm' not in args:
    b = f'{S},{W},{N},{E}'
    q = f"""[out:json][timeout:120];
(
  way["highway"]({b});
  way["natural"="water"]({b}); relation["natural"="water"]({b});
  way["water"]({b}); way["landuse"="reservoir"]({b}); relation["landuse"="reservoir"]({b});
  way["waterway"]({b});
  way["landuse"~"^(forest|orchard|farmland|meadow|grass|plantation)$"]({b}); relation["landuse"="forest"]({b});
  way["natural"~"^(wood|scrub|grassland|wetland)$"]({b}); relation["natural"="wood"]({b});
  way["leisure"~"^(park|garden)$"]({b});
  node["natural"="tree"]({b});
  way["building"]({b});
  node["place"]({b}); node["name"]["tourism"]({b}); node["name"]["amenity"]({b});
);
out geom;"""
    cp = os.path.join(CACHE, 'overpass.json')
    if not os.path.exists(cp):
        open(cp, 'wb').write(http(CFG['overpass_url'], urllib.parse.urlencode({'data': q}).encode()))
    els = json.load(open(cp, encoding='utf-8'))['elements']
    print(f'OSM: {len(els)} phan tu')
    ROAD_CLASS = {'motorway': 1, 'trunk': 1, 'primary': 1, 'secondary': 2, 'tertiary': 2, 'unclassified': 3, 'residential': 3,
                  'service': 4, 'track': 4, 'living_street': 3, 'road': 3, 'path': 5, 'footway': 5, 'cycleway': 5, 'steps': 5}
    ROAD_W = {1: 9, 2: 7, 3: 5, 4: 3.5, 5: 1.8}
    roads, water, land, trees, osm_bld, places = [], [], [], [], [], []
    def poly_from(e):
        if e['type'] == 'way' and 'geometry' in e and len(e['geometry']) >= 4 and e['geometry'][0] == e['geometry'][-1]:
            return Polygon(to_local_line(e['geometry']))
        if e['type'] == 'relation':   # ghep cac doan outer/inner thanh vong kin roi cat theo vung boi canh
            from shapely.ops import linemerge, polygonize
            def rings(role):
                ls = [LineString(to_local_line(m['geometry'])) for m in e.get('members', []) if m.get('role') == role and len(m.get('geometry', [])) >= 2]
                return list(polygonize(linemerge(ls))) if ls else []
            outer = unary_union(rings('outer'))
            if outer.is_empty: return None
            inner = rings('inner')
            if inner: outer = outer.difference(unary_union(inner))
            return outer.intersection(BOX)
        return None
    for e in els:
        t = e.get('tags', {})
        if 'highway' in t and e['type'] == 'way':
            c = ROAD_CLASS.get(t['highway'], 4)
            ls = LineString(to_local_line(e['geometry'])).difference(core_buf)
            if not ls.is_empty:
                roads.append({'type': 'Feature', 'geometry': mapping(ls), 'properties': {'highway': t['highway'], 'class': c, 'width': float(t.get('width', ROAD_W[c])) if str(t.get('width', '')).replace('.', '', 1).isdigit() else ROAD_W[c], 'name': t.get('name')}})
        elif t.get('natural') == 'water' or 'water' in t or t.get('landuse') == 'reservoir':
            p = poly_from(e)
            if p is not None and not p.is_empty: water.append({'type': 'Feature', 'geometry': mapping(p.buffer(0)), 'properties': {'kind': t.get('water') or t.get('natural') or t.get('landuse'), 'name': t.get('name')}})
        elif 'waterway' in t and e['type'] == 'way':
            water.append({'type': 'Feature', 'geometry': mapping(LineString(to_local_line(e['geometry']))), 'properties': {'kind': t['waterway'], 'name': t.get('name')}})
        elif t.get('landuse') or t.get('natural') in ('wood', 'scrub', 'grassland', 'wetland') or t.get('leisure') in ('park', 'garden'):
            p = poly_from(e)
            if p is not None and not p.is_empty:
                kind = t.get('landuse') or t.get('natural') or t.get('leisure')
                p = p.buffer(0).difference(core_buf)
                if not p.is_empty: land.append({'type': 'Feature', 'geometry': mapping(p), 'properties': {'kind': kind}})
        elif t.get('natural') == 'tree' and e['type'] == 'node':
            pt = Point(L.fwd(e['lat'], e['lon']))
            if not core_buf.contains(pt): trees.append({'type': 'Feature', 'geometry': mapping(pt), 'properties': {}})
        elif 'building' in t and e['type'] == 'way':
            p = poly_from(e)
            if p is not None and not p.is_empty:
                osm_bld.append((p.buffer(0), t))
        elif e['type'] == 'node' and t.get('name'):
            places.append({'type': 'Feature', 'geometry': mapping(Point(L.fwd(e['lat'], e['lon']))),
                           'properties': {'name': t['name'], 'kind': t.get('place') or t.get('tourism') or t.get('amenity')}})
    FC = lambda f: {'type': 'FeatureCollection', 'features': f}
    save('roads.geojson', FC(roads)); save('water.geojson', FC(water)); save('landcover.geojson', FC(land))
    save('trees.geojson', FC(trees)); save('places.geojson', FC(places))
    json.dump([(mapping(p), t) for p, t in osm_bld], open(os.path.join(CACHE, 'osm_buildings.json'), 'w'))
    print(f'  duong {len(roads)}, nuoc {len(water)}, phu dat {len(land)}, cay le {len(trees)}, nha OSM {len(osm_bld)}, dia danh {len(places)}')

# =============== 3. Nha: Overture (+ OSM bu) ===============
if '--skip-overture' not in args:
    from overturemaps import core as ov
    import pyarrow.fs as pafs
    _S3 = pafs.S3FileSystem
    class _S3Slow(_S3):  # mang cham: noi rong thoi gian ket noi/phan giai DNS
        def __new__(cls, *a, **k):
            k.setdefault('connect_timeout', 60); k.setdefault('request_timeout', 180)
            px = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
            if px: k['proxy_options'] = px
            return _S3(*a, **k)
    ov.fs.S3FileSystem = _S3Slow
    import shapely.wkb
    cp = os.path.join(CACHE, 'overture_buildings.json')
    if not os.path.exists(cp):
        rdr = ov.record_batch_reader('building', (W, S, E, N))
        recs = []
        for batch in rdr:
            d = batch.to_pydict()
            for i in range(batch.num_rows):
                g = shapely.wkb.loads(d['geometry'][i])
                src = d.get('sources', [None] * batch.num_rows)[i]
                recs.append({'wkt': g.wkt, 'height': d.get('height', [None] * batch.num_rows)[i], 'num_floors': d.get('num_floors', [None] * batch.num_rows)[i],
                             'source': (src[0]['dataset'] if src else None)})
        json.dump(recs, open(cp, 'w'))
    import shapely.wkt
    recs = json.load(open(cp))
    feats, polys = [], []
    def add(poly_ll_or_local, height, floors, source, local=False):
        g = poly_ll_or_local
        if not local:
            def f(x, y, z=None):
                xy = [L.fwd(la, lo) for lo, la in zip(x, y)]
                return np.array([a for a, _ in xy]), np.array([b for _, b in xy])
            g = shapely.ops.transform(f, g)
        if g.is_empty or core_buf.intersects(g.centroid): return
        polys.append(g)
        feats.append({'type': 'Feature', 'geometry': mapping(g), 'properties': {'height': height, 'floors': floors, 'source': source}})
    import shapely.ops
    for r in recs:
        g = shapely.wkt.loads(r['wkt'])
        if g.geom_type == 'MultiPolygon': g = max(g.geoms, key=lambda q: q.area)
        add(g, r['height'], r['num_floors'], r['source'])
    n_ov = len(feats)
    osm_cp = os.path.join(CACHE, 'osm_buildings.json'); n_bu = 0
    if os.path.exists(osm_cp):
        idx = unary_union(polys) if polys else None
        for gj, t in json.load(open(osm_cp)):
            g = shape(gj)
            if idx is None or not idx.intersects(g.centroid):
                lv = t.get('building:levels'); h = t.get('height')
                add(g, float(h) if h and h.replace('.', '', 1).isdigit() else None, int(lv) if lv and lv.isdigit() else None, 'OSM', local=True); n_bu += 1
    save('buildings.geojson', {'type': 'FeatureCollection', 'features': feats})
    print(f'Nha: Overture {n_ov}, OSM bu them {n_bu}')

# =============== 4. Vung loi + config cho web ===============
save('core.geojson', {'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'geometry': mapping(core), 'properties': {'name': 'NiNi Homestay', 'buffer_m': CFG.get('core_buffer_m', 0)}}]})
save('context.json', {'center_local_m': [cx, cy], 'radius_m': R, 'vertical_exaggeration': CFG['vertical_exaggeration'],
                      'water': CFG['water'], 'sun': CFG['sun'], 'center_latlon': CFG['center_latlon'], 'origin_utm48n': CFG['origin_utm48n'],
                      'generated': time.strftime('%Y-%m-%d %H:%M'),
                      'attribution': '© OpenStreetMap contributors (ODbL) · Overture Maps Foundation · AWS Terrain Tiles (Mapzen/SRTM…)'})
print('XONG')
