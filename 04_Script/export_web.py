# Xuat mo hinh NiNi Homestay ra web (glb + json). Chay trong Blender:
#   exec(open(r"<repo>/04_Script/export_web.py",encoding="utf-8").read())
# hoac: blender -b NiNi_Homestay.blend -P 04_Script/export_web.py
import bpy, os, json, math
ROOT=os.path.dirname(bpy.data.filepath); OUT=os.path.join(ROOT,'web','assets')
os.makedirs(os.path.join(OUT,'trees'),exist_ok=True)
sc=bpy.context.scene
if bpy.data.is_dirty: bpy.ops.wm.save_mainfile()

def bake_site_ground(size=2048):
    o=bpy.data.objects['DiaHinh_KhuDat']; m=o.data.materials[0]; nt=m.node_tree
    img=bpy.data.images.get('BAKE_DatKhuDat') or bpy.data.images.new('BAKE_DatKhuDat',size,size)
    tn=nt.nodes.new('ShaderNodeTexImage'); tn.image=img; nt.nodes.active=tn
    o.data.uv_layers.active=o.data.uv_layers['UV_VeTinh']
    eng=sc.render.engine; sc.render.engine='CYCLES'; sc.cycles.samples=1
    for ob in bpy.context.view_layer.objects: ob.select_set(False)
    o.hide_set(False); o.select_set(True); bpy.context.view_layer.objects.active=o
    bpy.ops.object.bake(type='DIFFUSE',pass_filter={'COLOR'},margin=4)
    sc.render.engine=eng
    img.filepath_raw=os.path.join(ROOT,'05_Texture','BAKE_DatKhuDat.png'); img.file_format='PNG'; img.save()
    # thay vat lieu bang anh da nuong (chi trong phien xuat, se revert)
    nt.nodes.clear(); out=nt.nodes.new('ShaderNodeOutputMaterial'); P=nt.nodes.new('ShaderNodeBsdfPrincipled')
    t=nt.nodes.new('ShaderNodeTexImage'); t.image=img; nt.links.new(t.outputs['Color'],P.inputs['Base Color']); nt.links.new(P.outputs[0],out.inputs[0])
    P.inputs['Roughness'].default_value=0.95

def simplify_materials():
    fallback={'M_Mai_LaDua':(0.36,0.27,0.15),'M_Dat_TuNhien':(0.2,0.16,0.08)}
    for m in bpy.data.materials:
        if not m.use_nodes: continue
        nt=m.node_tree; P=next((n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'),None)
        if not P: continue
        img=next((n for n in nt.nodes if n.type=='TEX_IMAGE' and n.image),None)
        bc=P.inputs['Base Color']
        for l in list(bc.links):
            if l.from_node.type!='TEX_IMAGE':
                nt.links.remove(l)
                if img: nt.links.new(img.outputs['Color'],bc)
                else: bc.default_value=(*fallback.get(m.name,tuple(m.diffuse_color)[:3]),1)
        if img and img.image and img.image.name.startswith('TX_La'):
            if not P.inputs['Alpha'].links: nt.links.new(img.outputs['Alpha'],P.inputs['Alpha'])
        for l in list(P.inputs['Normal'].links): nt.links.remove(l)

def export(path,objs,**kw):
    for ob in bpy.context.view_layer.objects: ob.select_set(False)
    for ob in objs:
        try: ob.hide_set(False); ob.select_set(True)
        except Exception: pass
    opt=dict(filepath=path,use_selection=True,export_apply=True,export_yup=True,
        export_image_format='JPEG',export_jpeg_quality=85,export_extras=False); opt.update(kw)
    bpy.ops.export_scene.gltf(**opt)
    return os.path.getsize(path)

bake_site_ground()
simplify_materials()
sizes={}
# dia hinh boi canh: giam subsurf cho nhe
T=bpy.data.objects['DiaHinh_BoiCanh']
for md in T.modifiers:
    if md.type=='SUBSURF': md.levels=1; md.render_levels=1
sizes['terrain']=export(os.path.join(OUT,'terrain.glb'),[T,bpy.data.objects['DiaHinh_KhuDat']])
# cong trinh + ranh gioi
objs=[o for c in ['03_HienTrang','02_RanhGioi'] for o in bpy.data.collections[c].all_objects]
sizes['buildings']=export(os.path.join(OUT,'buildings.glb'),objs)
# mau cay (dat ve goc toa do)
lib=bpy.data.collections['ThuVien_Cay']; lib.hide_viewport=False
names=[]
for o in sorted(lib.objects,key=lambda x:x.name):
    o.location=(0,0,0); fn=f'{o.name}.glb'; names.append(fn)
    sizes[o.name]=export(os.path.join(OUT,'trees',fn),[o],export_image_format='AUTO')
# vi tri cay
me=bpy.data.objects['MoiTruong_Cay'].data
V=[0]*len(me.vertices); me.attributes['variant'].data.foreach_get('value',V)
S=[0.0]*len(me.vertices); me.attributes['scale'].data.foreach_get('value',S)
R=[0.0]*len(me.vertices); me.attributes['rot'].data.foreach_get('value',R)
trees=[[round(v.co.x,2),round(v.co.y,2),round(v.co.z,2),V[i],round(S[i],3),round(R[i],3)] for i,v in enumerate(me.vertices)]
meta={'origin_utm48n':[sc['Origin_E'],sc['Origin_N']],'water_level':sc.get('MucNuoc',61.6),
      'water_min':50.0,'water_normal_full':62.0,'tree_models':names,'trees':trees,
      'sun':{'elevation_deg':38,'azimuth_deg':112}}
json.dump(meta,open(os.path.join(OUT,'scene.json'),'w'))
# Luu y: script da sua vat lieu tam thoi -> sau khi chay hay revert file (khong luu).
print('EXPORT_DONE',sizes)
