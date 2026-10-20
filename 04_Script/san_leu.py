# Dung san leu chuong (san 7x7, leu 5m, lan can, den day, ghe pallet, cau thang sat 3 bac)
# Goi: build_san(ten, (lat_tam_leu, lon_tam_leu), (lat_huong_ho, lon_huong_ho), rot_cw=do_xoay_thuan_chieu_kim_dong_ho)
import bpy, bmesh, math
from mathutils import Vector

def utm(lat,lon,zone=48):
    a=6378137.0; f=1/298.257223563; e2=f*(2-f); ep2=e2/(1-e2); k0=0.9996
    lon0=math.radians((zone-1)*6-180+3); phi=math.radians(lat); lam=math.radians(lon)
    N=a/math.sqrt(1-e2*math.sin(phi)**2); T=math.tan(phi)**2; C=ep2*math.cos(phi)**2; A=math.cos(phi)*(lam-lon0)
    M=a*((1-e2/4-3*e2**2/64-5*e2**3/256)*phi-(3*e2/8+3*e2**2/32+45*e2**3/1024)*math.sin(2*phi)+(15*e2**2/256+45*e2**3/1024)*math.sin(4*phi)-(35*e2**3/3072)*math.sin(6*phi))
    x=k0*N*(A+(1-T+C)*A**3/6+(5-18*T+T*T+72*C-58*ep2)*A**5/120)+500000
    y=k0*(M+N*math.tan(phi)*(A*A/2+(5-T+9*C+4*C*C)*A**4/24+(61-58*T+T*T+600*C-330*ep2)*A**6/720))
    return x,y

def build_san(name, tent_ll, lake_ll, rot_cw=0.0, shift=(0.0,0.0), S=7.0, DR=5.0, RISE=0.15, NSTEP=3, TR=0.3, SW=1.2):
    sc=bpy.context.scene; ox,oy=sc['Origin_E'],sc['Origin_N']
    def L(ll): x,y=utm(*ll); return Vector((x-ox,y-oy))
    C=L(tent_ll); Fp=L(lake_ll); fwd=(Fp-C).normalized()
    a0=math.radians(-rot_cw); fwd=Vector((fwd.x*math.cos(a0)-fwd.y*math.sin(a0),fwd.x*math.sin(a0)+fwd.y*math.cos(a0)))
    side=Vector((-fwd.y,fwd.x))
    C=C+Vector(shift)
    Tr=bpy.data.objects['DiaHinh_BoiCanh']; Te=Tr.evaluated_get(bpy.context.evaluated_depsgraph_get())
    def gz(x,y):
        h=Te.ray_cast(Vector((x,y,500)),Vector((0,0,-1))); return h[1].z if h[0] else 62.0
    root=bpy.data.collections['03_HienTrang']
    cS=bpy.data.collections.get('HT_SanLeu') or bpy.data.collections.new('HT_SanLeu')
    if cS.name not in [c.name for c in root.children]: root.children.link(cS)
    for o in list(cS.objects):
        if o.name==name or o.name.startswith(name+'_'): bpy.data.objects.remove(o,do_unlink=True)
    M=bpy.data.materials
    mDeck,mRail,mCanvas,mPost,mBulb,mPlate=M['M_San_Pallet'],M['M_LanCan_Sat'],M['M_Vai_Leu'],M['M_Go'],M['M_BongDen'],M['M_Sat_Tam']
    h=S/2; R=DR/2; dc=C+fwd*0.5; ang=math.atan2(fwd.y,fwd.x)
    def W(lx,ly): return dc+fwd*lx+side*ly
    lvl=gz(*W(-h-NSTEP*TR-0.05,0))+RISE*(NSTEP+1)
    emp=bpy.data.objects.new(name,None); cS.objects.link(emp); emp.location=(dc.x,dc.y,lvl); emp.rotation_euler=(0,0,ang); emp.empty_display_size=1
    def gl(lx,ly): return gz(*W(lx,ly))-lvl
    def mk(nm,builder,m):
        bm=bmesh.new(); builder(bm); me=bpy.data.meshes.new(nm); bm.to_mesh(me); bm.free(); me.materials.append(m)
        o=bpy.data.objects.new(nm,me); cS.objects.link(o); o.parent=emp; return o
    def box(bm,c,s):
        r=bmesh.ops.create_cube(bm,size=1.0)
        for v in r['verts']: v.co=Vector((c[0]+v.co.x*s[0],c[1]+v.co.y*s[1],c[2]+v.co.z*s[2]))
    def beam(bm,p0,p1,w,t):
        p0,p1=Vector(p0),Vector(p1); d=(p1-p0); d.normalize()
        up=Vector((0,0,1)) if abs(d.z)<0.9 else Vector((1,0,0))
        s=d.cross(up).normalized()*w/2; u=s.cross(d).normalized()*t/2
        vs=[bm.verts.new(p+a*s+b*u) for p in (p0,p1) for a in(-1,1) for b in(-1,1)]
        for f in [(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)]: bm.faces.new([vs[i] for i in f])
    mk(name+'_VanSan',lambda bm:[box(bm,(0,-h+0.3+i*0.585,-0.04),(S,0.55,0.08)) for i in range(12)],mDeck)
    def khung(bm):
        for x in(-h+0.1,0,h-0.1):
            for y in(-h+0.1,0,h-0.1):
                g=gl(x,y)-0.2; box(bm,(x,y,(-0.08+g)/2),(0.15,0.15,-0.08-g))
        for x in(-h+0.1,-h/3,h/3,h-0.1): box(bm,(x,0,-0.14),(0.1,S,0.12))
    mk(name+'_KhungDo',khung,mPost)
    RH=0.9
    def lancan(bm):
        for y in (-h+0.03,h-0.03):
            box(bm,(0,y,RH),(S,0.05,0.05)); box(bm,(0,y,RH/2),(S,0.025,0.025))
            for x in(-h+0.05,-h/3,h/3,h-0.05): box(bm,(x,y,RH/2),(0.05,0.05,RH))
        box(bm,(h-0.03,0,RH),(0.05,S,0.05)); box(bm,(h-0.03,0,RH/2),(0.025,S,0.025))
        for y in(-h/3,h/3): box(bm,(h-0.03,y,RH/2),(0.05,0.05,RH))
    mk(name+'_LanCan',lancan,mRail)
    mk(name+'_GhePallet',lambda bm:[box(bm,c,s) for c,s in [((h-0.75,h-1.4,0.18),(1.2,2.4,0.36)),((h-1.9,h-0.55,0.18),(1.2,0.8,0.36)),((h-1.75,h-1.75,0.22),(0.8,0.8,0.44))]],mDeck)
    WH=0.7; AP=3.0; tc=(-0.5,0); seg=32
    def leu(bm):
        r0=[];r1=[]
        for i in range(seg):
            t=2*math.pi*i/seg; x,y=tc[0]+R*math.cos(t),tc[1]+R*math.sin(t)
            r0.append(bm.verts.new((x,y,0))); r1.append(bm.verts.new((x,y,WH)))
        ap=bm.verts.new((tc[0],tc[1],AP))
        for i in range(seg):
            j=(i+1)%seg; t=2*math.pi*(i+0.5)/seg
            if abs(math.atan2(math.sin(t),math.cos(t)))>=0.33: bm.faces.new([r0[i],r0[j],r1[j],r1[i]])
            bm.faces.new([r1[i],r1[j],ap])
    lo=mk(name+'_Leu',leu,mCanvas)
    for p in lo.data.polygons: p.use_smooth=True
    lo.modifiers.new('Day','SOLIDIFY').thickness=0.02
    x0=tc[0]+R
    def hien(bm):
        v=[bm.verts.new(q) for q in [(x0-0.2,-0.8,WH+0.6),(x0-0.2,0.8,WH+0.6),(x0+0.9,0,WH+0.35),(x0-0.6,0,1.9)]]
        bm.faces.new([v[0],v[2],v[3]]); bm.faces.new([v[2],v[1],v[3]])
    mk(name+'_HienCua',hien,mCanvas)
    mk(name+'_CotLeu',lambda bm:[box(bm,(tc[0],tc[1],AP/2),(0.06,0.06,AP)),box(bm,(x0+0.9,0,(WH+0.35)/2),(0.04,0.04,WH+0.35))],mPost)
    def den(bm):
        for i in range(8): box(bm,(h-0.03,-h+0.4+i*(S-0.8)/7,RH-0.12),(0.08,0.08,0.1))
        for i in range(6):
            x=-h+0.6+i*(S-1.2)/5; box(bm,(x,-h+0.03,RH-0.12),(0.08,0.08,0.1)); box(bm,(x,h-0.03,RH-0.12),(0.08,0.08,0.1))
    mk(name+'_DenDay',den,mBulb)
    xt=-h; xb=-h-TR*NSTEP-0.05; gf=min(gl(xb,-SW/2),gl(xb,SW/2))
    def cauthang(bm):
        for y in (-SW/2,SW/2):
            beam(bm,(xt,y,-0.05),(xb,y,gf),0.05,0.14); beam(bm,(xb,y,gf-0.05),(xb,y,gf+0.95),0.04,0.04)
            beam(bm,(xt,y,-0.02),(xt,y,0.9),0.04,0.04); beam(bm,(xb,y,gf+0.9),(xt,y,0.9),0.05,0.05)
            beam(bm,(xb,y,gf+0.45),(xt,y,0.45),0.025,0.025)
    mk(name+'_CauThangSat',cauthang,mRail)
    def bac(bm):
        for k in range(1,NSTEP+1):
            x=-h-TR*(k-0.5); z=-RISE*k; box(bm,(x,0,z-0.01),(TR-0.02,SW+0.02,0.012)); box(bm,(x,0,z-0.035),(0.03,SW,0.04))
    mk(name+'_BacSat',bac,mPlate)
    cs=[gz(*W(a*h,b*h)) for a in(-1,1) for b in(-1,1)]
    return dict(name=name,tent=(round(C.x,2),round(C.y,2)),az=round(math.degrees(math.atan2(fwd.x,fwd.y))%360,1),
                lvl=round(lvl,2),h_sau=round(lvl-max(cs[0],cs[1]),2),h_truoc=round(lvl-min(cs[2],cs[3]),2),emp=emp)
