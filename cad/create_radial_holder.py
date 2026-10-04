"""Fusion MCP: inject RADIAL_SPEC and OUTPUT_ROOT.
One flat-backed printed bridge; the corrected dial-lug bolt is also the angle pivot.
The open original radial Fusion document supplies the reference dial.
"""
import adsk.core, adsk.fusion, json, math
from pathlib import Path


def run(_context: str):
    app=adsk.core.Application.get()
    source=next((v for v in app.documents if v.name=='probe-dial-radial' and v.dataFile),None)
    assert source, 'Open the original probe-dial-radial design'
    source_design=adsk.fusion.Design.cast(source.products.itemByProductType('DesignProductType'))
    temp=adsk.fusion.TemporaryBRepManager.get()
    dial=temp.copy(next(b for c in source_design.allComponents for b in c.bRepBodies if b.name=='Radial dial case and rear lug'))
    source_dial_x=source_design.userParameters.itemByName('dial_reference_x').value
    source_rear=source_design.userParameters.itemByName('case_rear').value
    normalize=adsk.core.Matrix3D.create();normalize.translation=adsk.core.Vector3D.create(0,0,4-source_rear);assert temp.transform(dial,normalize)
    # Upgrade earlier archives whose rear-lug bore was parallel to the pin.
    bore=next(adsk.core.Cylinder.cast(f.geometry) for f in dial.faces if adsk.core.Cylinder.cast(f.geometry) and abs(adsk.core.Cylinder.cast(f.geometry).radius-.3425)<1e-6)
    if abs(bore.axis.y)>.9:
        B=adsk.fusion.BooleanTypes
        def box(z0,z1):
            return temp.createBox(adsk.core.OrientedBoundingBox3D.create(adsk.core.Point3D.create(0,0,(z0+z1)/20),adsk.core.Vector3D.create(1,0,0),adsk.core.Vector3D.create(0,1,0),100,100,(z1-z0)/10))
        lug=temp.copy(dial)
        assert temp.booleanOperation(lug,box(-1000,40),B.IntersectionBooleanType)
        assert temp.booleanOperation(dial,box(40,1000),B.IntersectionBooleanType)
        rotate=adsk.core.Matrix3D.create();rotate.setToRotation(math.pi/2,adsk.core.Vector3D.create(0,0,1),adsk.core.Point3D.create(source_dial_x,0,0))
        assert temp.transform(lug,rotate)
        assert temp.booleanOperation(dial,lug,B.UnionBooleanType)
    cutoff=temp.createBox(adsk.core.OrientedBoundingBox3D.create(adsk.core.Point3D.create(0,-48.65,0),adsk.core.Vector3D.create(1,0,0),adsk.core.Vector3D.create(0,1,0),100,102.7,100))
    assert temp.booleanOperation(dial,cutoff,adsk.fusion.BooleanTypes.IntersectionBooleanType)
    for y0,y1,r in [(27,47,4),(47,62,2)]:
        stem=temp.createCylinderOrCone(adsk.core.Point3D.create(source_dial_x,y0/10,5.25),r/10,adsk.core.Point3D.create(source_dial_x,y1/10,5.25),r/10)
        assert temp.booleanOperation(dial,stem,adsk.fusion.BooleanTypes.UnionBooleanType)

    doc=next((v for v in app.documents if v.name=='probe-dial-radial' and v.dataFile),None)
    assert doc, 'Open the original probe-dial-radial Fusion document before regenerating'
    doc.activate();existing=adsk.fusion.Design.cast(app.activeProduct)
    # Preserve any unsaved original edits before replacing generated geometry.
    import tempfile,time
    backup=Path(tempfile.gettempdir())/('probe-dial-radial-before-regeneration-'+str(time.time_ns())+'.f3d')
    assert existing.exportManager.execute(existing.exportManager.createFusionArchiveExportOptions(str(backup)))
    for occurrence in list(existing.rootComponent.occurrences):assert occurrence.deleteMe()
    while existing.userParameters.count:
        old=existing.userParameters.count
        for parameter in list(existing.userParameters):
            if parameter.isValid:parameter.deleteMe()
        assert existing.userParameters.count<old, 'Referenced parameters remain'
    d=adsk.fusion.Design.cast(app.activeProduct); d.designType=adsk.fusion.DesignTypes.ParametricDesignType
    d.designIntent=adsk.fusion.DesignIntentTypes.HybridDesignIntentType
    root=d.rootComponent; p=RADIAL_SPEC['parameters']; val=adsk.core.ValueInput.createByString
    pt=lambda x,y,z=0:adsk.core.Point3D.create(x/10,y/10,z/10)
    for k,v in p.items():
        unit='deg' if k.startswith('angle_') and k!='angle_radius' else 'mm'
        d.userParameters.add(k,val(str(v)+' '+unit),unit,'Radial V13; regenerate sketches from shared specification')
    F=adsk.fusion.FeatureOperations
    def component(name):
        c=root.occurrences.addNewComponent(adsk.core.Matrix3D.create()).component; c.name=name; return c
    def plane(c,axis,offset):
        i=c.constructionPlanes.createInput();i.setByOffset(getattr(c,axis+'ConstructionPlane'),val(str(offset)+' mm'))
        v=c.constructionPlanes.add(i);v.isLightBulbOn=False;return v
    def polygon(c,axis,offset,coords,distance,op,name):
        sk=c.sketches.add(plane(c,axis,offset));sk.name=name
        pts=[sk.modelToSketchSpace(pt(*q)) for q in coords]
        for a,b in zip(pts,pts[1:]+pts[:1]):sk.sketchCurves.sketchLines.addByTwoPoints(a,b)
        normal=sk.sketchToModelSpace(adsk.core.Point3D.create(0,0,1));origin=sk.sketchToModelSpace(adsk.core.Point3D.create(0,0,0))
        direction=(normal.z-origin.z) if axis=='xY' else (normal.x-origin.x) if axis=='yZ' else (normal.y-origin.y)
        f=c.features.extrudeFeatures.addSimple(sk.profiles.item(0),val(str(distance*(1 if direction>0 else -1))+' mm'),op)
        f.name=name;sk.isVisible=False;return f
    def rect(c,x0,y0,x1,y1,z,h,op,name):
        return polygon(c,'xY',z,[(x0,y0,z),(x1,y0,z),(x1,y1,z),(x0,y1,z)],h,op,name)
    def capsule(c,x0,x1,y,r,z,h,name):
        sk=c.sketches.add(plane(c,'xY',z));lines=sk.sketchCurves.sketchLines;arcs=sk.sketchCurves.sketchArcs
        lines.addByTwoPoints(pt(x0,y-r),pt(x1,y-r));arcs.addByThreePoints(pt(x1,y-r),pt(x1+r,y),pt(x1,y+r))
        lines.addByTwoPoints(pt(x1,y+r),pt(x0,y+r));arcs.addByThreePoints(pt(x0,y+r),pt(x0-r,y),pt(x0,y-r))
        f=c.features.extrudeFeatures.addSimple(sk.profiles.item(0),val(str(h)+' mm'),F.CutFeatureOperation);f.name=name;sk.isVisible=False
    def hull(points):
        points=sorted(set(points))
        def cross(o,a,b):return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
        lower=[];upper=[]
        for v in points:
            while len(lower)>1 and cross(lower[-2],lower[-1],v)<=0:lower.pop()
            lower.append(v)
        for v in reversed(points):
            while len(upper)>1 and cross(upper[-2],upper[-1],v)<=0:upper.pop()
            upper.append(v)
        return lower[:-1]+upper[:-1]
    def teardrop(y,z,r):
        # Inscribed polygon stays outside a 5 mm shaft; 5.5 mm nominal diameter.
        return [(y+r*math.cos(t),z+r*math.sin(t)) for t in [math.radians(135+i*270/36) for i in range(37)]]+[(y,z+r*math.sqrt(2))]
    def shaftcut(c,x,h,centres,name):
        points=hull([v for y,z in centres for v in teardrop(y,z,p['bolt_clearance']/2)])
        polygon(c,'yZ',x,[(x,y,z) for y,z in points],h,F.CutFeatureOperation,name)
    bridge=component('PRINT - slotted radial bridge')
    polygon(bridge,'xY',0,[(-28,-58,0),(21,-58,0),(21,-52,0),(152,-52,0),(152,-28,0),(21,-28,0),(21,-22,0),(-28,-22,0)],8,F.NewBodyFeatureOperation,'Flat 8 mm slotted mounting plate')
    edges=adsk.core.ObjectCollection.create()
    for e in bridge.bRepBodies.item(0).edges:
        b=e.boundingBox
        if abs(b.maxPoint.x-b.minPoint.x)<1e-7 and abs(b.maxPoint.y-b.minPoint.y)<1e-7:edges.add(e)
    fi=bridge.features.filletFeatures.createInput();fi.edgeSetInputs.addConstantRadiusEdgeSet(edges,val('3 mm'),False);bridge.features.filletFeatures.add(fi)
    cy=p['pivot_y'];cz=p['pivot_z'];radius=10
    tab=p['ear_thickness'];left=p['dial_reference_x']-p['lug_thickness']/2-tab
    right=left+tab
    rect(bridge,left-p['pivot_foot_margin'],-34,right+p['pivot_foot_margin'],10,0,p['foot_thickness'],F.JoinFeatureOperation,'Solid 8 mm projecting arm')
    for x in [left]:
        sk=bridge.sketches.add(plane(bridge,'yZ',x));sk.name='Solid web to rounded lug seat'
        point=lambda y,z:sk.modelToSketchSpace(pt(x,y,z))
        lines=sk.sketchCurves.sketchLines;arcs=sk.sketchCurves.sketchArcs
        lines.addByTwoPoints(point(-34,0),point(10,0));lines.addByTwoPoints(point(10,0),point(10,cz))
        arcs.addByThreePoints(point(10,cz),point(0,cz+10),point(-10,cz))
        r=p['ramp_radius'];yc=-10-r
        lines.addByTwoPoints(point(-10,cz),point(yc,cz-r))
        lines.addByTwoPoints(point(yc,cz-r),point(-34,8));lines.addByTwoPoints(point(-34,8),point(-34,0))
        bridge.features.extrudeFeatures.addSimple(sk.profiles.item(0),val(str(tab)+' mm'),F.JoinFeatureOperation);sk.isVisible=False
        shaftcut(bridge,x,tab,[(cy,cz)],'M5 lug clearance with 45 degree print roof')
    # Apply separate local root radii, never propagate around the support outline.
    for x,r,name in [(left,6,'R6 load-bearing root'),(right,3,'R3 dial clearance root')]:
        edges=adsk.core.ObjectCollection.create()
        for e in bridge.bRepBodies.item(0).edges:
            b=e.boundingBox
            if abs(b.minPoint.z-p['foot_thickness']/10)<1e-6 and abs(b.maxPoint.z-p['foot_thickness']/10)<1e-6 and abs(b.maxPoint.x-b.minPoint.x)<1e-6 and abs(b.minPoint.x-x/10)<1e-6 and b.maxPoint.y-b.minPoint.y>1:edges.add(e)
        assert edges.count==1
        f=bridge.features.filletFeatures.createInput();f.edgeSetInputs.addConstantRadiusEdgeSet(edges,val(str(r)+' mm'),False)
        bridge.features.filletFeatures.add(f).name=name
    sk=bridge.sketches.add(plane(bridge,'yZ',left));sk.name='Local 16 mm washer clearance'
    sk.sketchCurves.sketchCircles.addByCenterRadius(sk.modelToSketchSpace(pt(left,cy,cz)),.8)
    normal=sk.sketchToModelSpace(adsk.core.Point3D.create(0,0,1));origin=sk.sketchToModelSpace(adsk.core.Point3D.create(0,0,0))
    bridge.features.extrudeFeatures.addSimple(sk.profiles.item(0),val(str(-9 if normal.x>origin.x else 9)+' mm'),F.CutFeatureOperation).name='Washer-only circular relief; preserve ear face'
    sk.isVisible=False
    # Concave plan fillets reinforce both foot-to-crossbar junctions without raising the bed.
    edges=adsk.core.ObjectCollection.create()
    for e in bridge.bRepBodies.item(0).edges:
        b=e.boundingBox
        if abs(b.minPoint.y+2.8)<1e-6 and abs(b.maxPoint.y+2.8)<1e-6 and abs(b.maxPoint.x-b.minPoint.x)<1e-6 and b.maxPoint.z-b.minPoint.z>.19 and any(abs(b.minPoint.x-x/10)<1e-6 for x in [left-p['pivot_foot_margin'],right+p['pivot_foot_margin']]):edges.add(e)
    assert edges.count==2
    f=bridge.features.filletFeatures.createInput();f.edgeSetInputs.addConstantRadiusEdgeSet(edges,val('bridge_root_radius'),False)
    bridge.features.filletFeatures.add(f).name='R8 side junction fillets'
    for y in [-49,-31]:capsule(bridge,p['left_slot_min'],p['left_slot_max'],y,2.75,0,8,'Left horizontal mounting slot')
    capsule(bridge,p['right_slot_min'],p['right_slot_max'],-40,2.75,0,8,'Right horizontal mounting slot')
    for a,b in [(28,33),(80,94)]:capsule(bridge,a,b,-40,5,0,8,'Rounded beam relief')
    # User-added Fusion v9 fillets: round only the two exposed arm-end corners.
    edges=adsk.core.ObjectCollection.create()
    for e in bridge.bRepBodies.item(0).edges:
        b=e.boundingBox
        if (abs(b.minPoint.y-1)<1e-6 and abs(b.maxPoint.y-1)<1e-6
            and abs(b.maxPoint.x-b.minPoint.x)<1e-6
            and abs(b.minPoint.z)<1e-6 and abs(b.maxPoint.z-.8)<1e-6
            and any(abs(b.minPoint.x-x/10)<1e-6 for x in [left-p['pivot_foot_margin'],right+p['pivot_foot_margin']])):
            edges.add(e)
    assert edges.count==2, 'Expected both arm-end vertical corners'
    f=bridge.features.filletFeatures.createInput()
    f.edgeSetInputs.addConstantRadiusEdgeSet(edges,val('2.5 mm'),True)
    bridge.features.filletFeatures.add(f).name='Arm-end corners R2.5 (Fusion v9 user edit)'
    bridge.bRepBodies.item(0).name='Radial printable bridge'
    assert bridge.bRepBodies.count==1 and bridge.bRepBodies.item(0).isSolid
    # The reference dial already points upward; only its rear lug was corrected.
    t=adsk.core.Matrix3D.create();t.translation=adsk.core.Vector3D.create(p['dial_reference_x']/10-source_dial_x,0,(p['case_rear']-40)/10)
    assert temp.transform(dial,t)
    ref=component('REF - same measured KATSU dial');base=ref.features.baseFeatures.add();base.startEdit();ref.bRepBodies.add(dial,base);base.finishEdit();ref.bRepBodies.item(0).name='Radial dial case and rear lug'
    d.computeAll();d.activateRootComponent();app.activeViewport.fit()
    print(json.dumps({'document':doc.name,'solids':[{ 'name':c.bRepBodies.item(0).name,'volumeMm3':c.bRepBodies.item(0).volume*1000} for c in [bridge]],'warnings':[t.name+': '+t.errorOrWarningMessage for t in d.timeline if t.healthState!=adsk.fusion.FeatureHealthStates.HealthyFeatureHealthState]}))
