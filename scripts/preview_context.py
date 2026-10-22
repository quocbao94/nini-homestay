"""Ve ban do kiem tra du lieu boi canh -> scripts/.cache/preview_context.png"""
import json, os, numpy as np, matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LightSource
D = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'web', 'public', 'data')
m = json.load(open(f'{D}/terrain.json')); G = m['width']; H = np.fromfile(f'{D}/heightmap.f32', '<f4').reshape(G, G)
x0, y0, x1, y1 = m['extent_local_m']
fig, ax = plt.subplots(figsize=(10, 10)); ls = LightSource(315, 40)
ax.imshow(ls.shade(H, plt.cm.terrain, vert_exag=4, blend_mode='soft', vmin=40, vmax=110), extent=(x0, x1, y0, y1))
cs = ax.contour(np.linspace(x0, x1, G), np.linspace(y1, y0, G), H, levels=[50, 55, 62, 70, 80, 90, 100], colors='k', linewidths=0.4, alpha=0.5); ax.clabel(cs, fontsize=6)
ax.contour(np.linspace(x0, x1, G), np.linspace(y1, y0, G), H, levels=[62], colors='#0060ff', linewidths=1.2)
def draw(fn, **kw):
    p = f'{D}/{fn}'
    if not os.path.exists(p): return 0
    fs = json.load(open(p))['features']
    for f in fs:
        g = f['geometry']; t = g['type']; polys = []
        if t == 'Polygon': polys = [g['coordinates']]
        elif t == 'MultiPolygon': polys = g['coordinates']
        for pg in polys:
            a = np.array(pg[0]); ax.fill(a[:, 0], a[:, 1], **kw)
        lines = [g['coordinates']] if t == 'LineString' else g['coordinates'] if t == 'MultiLineString' else []
        for ln in lines:
            a = np.array(ln); ax.plot(a[:, 0], a[:, 1], color=kw.get('ec', 'k'), lw=kw.get('lw', 1))
        if t == 'Point': ax.plot(*g['coordinates'], 'o', ms=2, color=kw.get('fc', 'g'))
    return len(fs)
n = {}
n['water'] = draw('water.geojson', fc='#3a7bd5', alpha=0.35, ec='#1a4b95', lw=0.8)
n['land'] = draw('landcover.geojson', fc='#2e7d32', alpha=0.35, ec='#1b5e20', lw=0.5)
n['bld'] = draw('buildings.geojson', fc='#d84315', alpha=0.9, ec='#bf360c', lw=0.3)
n['roads'] = draw('roads.geojson', ec='#ffd54f', lw=1.6)
n['core'] = draw('core.geojson', fc='none', ec='#ff00ff', lw=2)
ax.set_xlim(x0, x1); ax.set_ylim(y0, y1); ax.set_title(f"Boi canh {x1-x0:.0f}x{y1-y0:.0f} m | DEM {m['min_m']:.1f}-{m['max_m']:.1f} m | " + ', '.join(f'{k}:{v}' for k, v in n.items()) + ' | xanh dam = duong dong muc 62 m', fontsize=9)
plt.savefig(os.path.join(os.path.dirname(__file__), '.cache', 'preview_context.png'), dpi=110, bbox_inches='tight'); print(n)
