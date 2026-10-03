"""Fusion MCP: inject RADIAL_SPEC and OUTPUT_ROOT (repository directory).
The checked-in radial assembly supplies the measured dial without local CAD state.
Two printable components, neutral coordinates.
Flat bridge Z=0; dial arm prints on its broad X=47 face.
A double-sided M5 fork pivot sets tilt; three frame slots set lateral position.
"""
import adsk.core, adsk.fusion, json, math
from pathlib import Path


def run(_context: str):
    app=adsk.core.Application.get()
    archive=Path(OUTPUT_ROOT)/'cad/radial-dial-holder.f3d'
    assert archive.is_file(), 'Missing measured dial source: '+str(archive)
    source=app.importManager.importToNewDocument(app.importManager.createFusionArchiveImportOptions(str(archive)))
    assert source, 'Could not import the saved radial assembly'
    source_design=adsk.fusion.Design.cast(source.products.itemByProductType('DesignProductType'))
    temp=adsk.fusion.TemporaryBRepManager.get()
    dial=temp.copy(next(b for c in source_design.allComponents for b in c.bRepBodies if b.name=='Radial dial case and rear lug'))
    source_dial_x=source_design.userParameters.itemByName('dial_reference_x').value
    source.close(False)
    doc=app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType); doc.name=RADIAL_SPEC['name']+' V'+str(RADIAL_SPEC['revision'])+' - assembled with dial'
    d=adsk.fusion.Design.cast(app.activeProduct); d.designType=adsk.fusion.DesignTypes.ParametricDesignType
    d.designIntent=adsk.fusion.DesignIntentTypes.HybridDesignIntentType
    root=d.rootComponent; p=RADIAL_SPEC['parameters']; val=adsk.core.ValueInput.createByString
    pt=lambda x,y,z=0:adsk.core.Point3D.create(x/10,y/10,z/10)
    for k,v in p.items():
        unit='deg' if k.startswith('angle_') and k!='angle_radius' else 'mm'
        d.userParameters.add(k,val(str(v)+' '+unit),unit,'Radial V8; regenerate sketches from shared specification')
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
    polygon(bridge,'xY',0,[(-28,-78,0),(21,-78,0),(21,-72,0),(152,-72,0),(152,-48,0),(21,-48,0),(21,-42,0),(-28,-42,0)],8,F.NewBodyFeatureOperation,'Flat 8 mm slotted mounting plate')
    edges=adsk.core.ObjectCollection.create()
    for e in bridge.bRepBodies.item(0).edges:
        b=e.boundingBox
        if abs(b.maxPoint.x-b.minPoint.x)<1e-7 and abs(b.maxPoint.y-b.minPoint.y)<1e-7:edges.add(e)
    fi=bridge.features.filletFeatures.createInput();fi.edgeSetInputs.addConstantRadiusEdgeSet(edges,val('3 mm'),False);bridge.features.filletFeatures.add(fi)
    cy=p['pivot_y'];cz=p['pivot_z'];radius=p['pivot_radius'];fixed=p['pivot_fixed_x'];tab=p['pivot_tab_thickness']
    # Two fixed cheeks flank the moving arm; a single longer M5 clamps both faces.
    rect(bridge,fixed-p['pivot_foot_margin'],-54,p['pivot_moving_x']+2*tab+p['pivot_gap']+p['pivot_foot_margin'],-14,0,8,F.JoinFeatureOperation,'Symmetric fork foot - 6 mm outside each cheek')
    moving_right=p['pivot_moving_x']+tab+p['pivot_gap']
    for x in [fixed,moving_right]:
        face=[(x,-54,0),(x,cy+radius,0),(x,cy+radius,cz)]
        face += [(x,cy+radius*math.cos(math.radians(a)),cz+radius*math.sin(math.radians(a))) for a in range(2,181,2)]
        face += [(x,-54,8)]
        polygon(bridge,'yZ',x,face,tab,F.JoinFeatureOperation,'4 mm fixed fork cheek with flat bearing face')
        shaftcut(bridge,x,tab,[(cy,cz)],'M5 pivot clearance with 45 degree print roof')
    # Concave fillets strengthen the two outer fork roots; keep the inner gap clear.
    root_edges=adsk.core.ObjectCollection.create()
    for e in bridge.bRepBodies.item(0).edges:
        b=e.boundingBox
        if abs(b.minPoint.z-.8)<1e-6 and abs(b.maxPoint.z-.8)<1e-6 and abs(b.maxPoint.x-b.minPoint.x)<1e-6 and any(abs(b.minPoint.x-x/10)<1e-6 for x in [fixed,moving_right+tab]) and b.maxPoint.y-b.minPoint.y>1:
            root_edges.add(e)
    assert root_edges.count==2,root_edges.count
    f=bridge.features.filletFeatures.createInput();f.edgeSetInputs.addConstantRadiusEdgeSet(root_edges,val('pivot_root_radius'),False)
    bridge.features.filletFeatures.add(f).name='R4 reinforcement fillets on both outer pivot roots'
    for y in [-69,-51]:capsule(bridge,p['left_slot_min'],p['left_slot_max'],y,2.75,0,8,'Left horizontal mounting slot')
    capsule(bridge,p['right_slot_min'],p['right_slot_max'],-60,2.75,0,8,'Right horizontal mounting slot')
    for a,b in [(28,33),(65,94)]:capsule(bridge,a,b,-60,5,0,8,'Rounded relief between continuous beam ribs')
    bridge.bRepBodies.item(0).name='Radial printable bridge'
    carriage=component('PRINT - flat pivoting dial arm')
    moving=p['pivot_moving_x']
    circle=[(cy+radius*math.cos(math.radians(a)),cz+radius*math.sin(math.radians(a))) for a in range(0,360,2)]
    outline=hull(circle+[(-8.9,18),(-2.6,18),(-2.6,38.5),(-8.9,38.5)])
    polygon(carriage,'yZ',moving,[(moving,y,z) for y,z in outline],tab,F.NewBodyFeatureOperation,'4 mm flat dial arm with round pivot bearing')
    sk=carriage.sketches.add(plane(carriage,'yZ',moving));sk.sketchCurves.sketchCircles.addByCenterRadius(sk.modelToSketchSpace(pt(moving,cy,cz)),.275)
    carriage.features.extrudeFeatures.addSimple(sk.profiles.item(0),val('4 mm'),F.CutFeatureOperation);sk.isVisible=False
    sk=carriage.sketches.add(plane(carriage,'yZ',moving));sk.sketchCurves.sketchCircles.addByCenterRadius(sk.modelToSketchSpace(pt(moving,-12,25)),.2)
    carriage.features.extrudeFeatures.addSimple(sk.profiles.item(0),val('4 mm'),F.CutFeatureOperation);sk.isVisible=False
    # Both projections grow from the broad arm face, so there are no floating layers.
    rect(carriage,moving,-5.4,71,-2.6,18,20.5,F.JoinFeatureOperation,'2.8 mm lug mounting ear - 8 mm stack with metal lug')
    rect(carriage,moving,-8.9,71,-5.4,18,6,F.JoinFeatureOperation,'Lug root reinforcement below washer')
    # The arm prints +X up: roof points toward +X, not toward assembly +Z.
    points=teardrop(29.75,p['dial_reference_x'],2.75)
    polygon(carriage,'xZ',-5.4,[(v,-5.4,u) for u,v in points],2.8,F.CutFeatureOperation,'M5 lug clearance - print roof toward +X')
    carriage.bRepBodies.item(0).name='Radial printable C-holder'
    for c in [bridge,carriage]:assert c.bRepBodies.count==1 and c.bRepBodies.item(0).isSolid
    # The saved reference already has the upward probe orientation and preload.
    t=adsk.core.Matrix3D.create();t.translation=adsk.core.Vector3D.create(p['dial_reference_x']/10-source_dial_x,0,0)
    assert temp.transform(dial,t)
    ref=component('REF - same measured KATSU dial');base=ref.features.baseFeatures.add();base.startEdit();ref.bRepBodies.add(dial,base);base.finishEdit();ref.bRepBodies.item(0).name='Radial dial case and rear lug'
    d.computeAll();d.activateRootComponent();app.activeViewport.fit()
    print(json.dumps({'document':doc.name,'solids':[{ 'name':c.bRepBodies.item(0).name,'volumeMm3':c.bRepBodies.item(0).volume*1000} for c in [bridge,carriage]],'warnings':[t.name+': '+t.errorOrWarningMessage for t in d.timeline if t.healthState!=adsk.fusion.FeatureHealthStates.HealthyFeatureHealthState]}))
