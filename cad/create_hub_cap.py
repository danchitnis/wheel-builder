"""Build V2 through Fusion MCP; inject shared hubSupportCap.json as CAP_SPEC.
Replaces our V1 visibly, retaining its geometry hidden for recovery.
Print upright: local Fusion Z up, collar opening on bed. No socket bridge.
"""
import adsk.core, adsk.fusion, json, math

def run(_context: str):
    app = adsk.core.Application.get()
    design = adsk.fusion.Design.cast(app.activeProduct)
    root = design.rootComponent
    assert not any(c.name.startswith('PRINT - V2') for c in design.allComponents), 'V2 already exists'
    assert root.bRepBodies.count == 0, 'Unexpected root geometry'
    allowed = ('PRINT - identical 2020 V hub cap', 'TEST - 8 mm socket and land-rib coupon')
    assert all(o.component.name in allowed for o in root.occurrences), 'Unexpected existing components'
    for o in root.occurrences:
        o.isLightBulbOn = False
    for c in design.allComponents:
        if c.name in allowed: c.name = 'SUPERSEDED V1 - ' + c.name
    for p in list(design.userParameters): p.name = 'v1_' + p.name
    design.designType = adsk.fusion.DesignTypes.ParametricDesignType
    design.designIntent = adsk.fusion.DesignIntentTypes.HybridDesignIntentType
    app.activeDocument.name = CAP_SPEC['name']
    val = adsk.core.ValueInput.createByString
    for name, number in CAP_SPEC['parameters'].items():
        design.userParameters.add(name,val(str(number)+' mm'),'mm','V2 upright printable cap')
    for name, expr in [('socket','profile_width + socket_clearance'),('outer','socket + 2 * wall'),('key_width','slot_width + key_interference'),('roof_opening','socket - 2 * seat_ledge')]:
        design.userParameters.add(name,val(expr),'mm','Derived V2 dimension')
    # Keep the cavity roof at exactly 45 degrees when socket dimensions change.
    design.userParameters.itemByName('roof_rise').expression = 'roof_opening/2'
    ev = lambda s: design.unitsManager.evaluateExpression(s,'mm')
    point = adsk.core.Point3D.create
    F = adsk.fusion.FeatureOperations
    D = adsk.fusion.DimensionOrientations
    def plane(c, base, expr):
        i = c.constructionPlanes.createInput()
        i.setByOffset(base, val(expr))
        p = c.constructionPlanes.add(i)
        p.name = 'Datum ' + expr
        p.isLightBulbOn = False
        return p

    def polygon(sk, coords):
        # Coordinate dimensions keep the complete profile editable, including V faces.
        pts = []
        anchors = [{}, {}]
        for ex, ey in coords:
            x, y = ev(ex), ev(ey)
            if abs(x) + abs(y) < 1e-9:
                pts.append(sk.originPoint)
                continue
            p = sk.sketchPoints.add(point(x,y,0))
            for axis, value, expr in [(0,x,ex),(1,y,ey)]:
                if expr in anchors[axis]:
                    if axis == 0: sk.geometricConstraints.addVerticalPoints(p, anchors[axis][expr])
                    else: sk.geometricConstraints.addHorizontalPoints(p, anchors[axis][expr])
                elif abs(value) < 1e-9:
                    if axis == 0: sk.geometricConstraints.addVerticalPoints(p, sk.originPoint)
                    else: sk.geometricConstraints.addHorizontalPoints(p, sk.originPoint)
                else:
                    dim = sk.sketchDimensions.addDistanceDimension(sk.originPoint,p,D.HorizontalDimensionOrientation if axis == 0 else D.VerticalDimensionOrientation,point(x+0.2,y+0.2,0))
                    dim.parameter.expression = expr if value > 0 else '-(' + expr + ')'
                anchors[axis][expr] = p
            pts.append(p)
        for a,b in zip(pts,pts[1:]+pts[:1]):
            sk.sketchCurves.sketchLines.addByTwoPoints(a,b)

    def rect(sk,x0,y0,x1,y1):
        polygon(sk,[(x0,y0),(x1,y0),(x1,y1),(x0,y1)])

    def extrude(c,sk,distance,op,name,ring=False):
        profile = next((p for p in sk.profiles if p.profileLoops.count == 2),None) if ring else sk.profiles.item(0)
        assert profile, name + ' profile missing'
        f = c.features.extrudeFeatures.addSimple(profile,val(distance),op)
        f.name = name
        sk.isVisible = False
        return f

    def sleeve(c,depth):
        base=plane(c,c.xYConstructionPlane,'-('+depth+')')
        sk=c.sketches.add(base); sk.name='Short open locating collar'
        rect(sk,'-outer/2','-outer/2','outer/2','outer/2')
        rect(sk,'-socket/2','-socket/2','socket/2','socket/2')
        extrude(c,sk,depth,F.NewBodyFeatureOperation,'Open collar - no horizontal roof',True)
        keys=[('socket/2-key_depth','-key_width/2','socket/2+wall/4','key_width/2'),
              ('-socket/2-wall/4','-key_width/2','-socket/2+key_depth','key_width/2'),
              ('-key_width/2','socket/2-key_depth','key_width/2','socket/2+wall/4'),
              ('-key_width/2','-socket/2-wall/4','key_width/2','-socket/2+key_depth')]
        for n,r in enumerate(keys):
            sk=c.sketches.add(base); sk.name='Slot locating tongue '+str(n+1)
            rect(sk,*r)
            extrude(c,sk,depth,F.JoinFeatureOperation,'Slot friction tongue '+str(n+1))
        edges=adsk.core.ObjectCollection.create()
        for e in c.bRepBodies.item(0).edges:
            b=e.boundingBox
            if abs(b.minPoint.z+ev(depth))<1e-6 and abs(b.maxPoint.z+ev(depth))<1e-6: edges.add(e)
        ci=c.features.chamferFeatures.createInput2()
        ci.chamferEdgeSets.addEqualDistanceChamferEdgeSet(edges,val('entry_chamfer'),False)
        c.features.chamferFeatures.add(ci).name='45 degree entry on collar and tongues'

    occurrence=root.occurrences.addNewComponent(adsk.core.Matrix3D.create())
    c=occurrence.component; c.name='PRINT - V2 centred hub cap'
    sleeve(c,'skirt_depth')
    lower=c.sketches.add(c.xYConstructionPlane); lower.name='Rail-end seating footprint'
    rect(lower,'-outer/2','-outer/2','outer/2','outer/2')
    upper=c.sketches.add(plane(c,c.xYConstructionPlane,'saddle_rise')); upper.name='Centred narrow saddle root'
    rect(upper,'-fin_root_depth/2','-cradle_width/2','fin_root_depth/2','cradle_width/2')
    li=c.features.loftFeatures.createInput(F.JoinFeatureOperation)
    li.loftSections.add(lower.profiles.item(0)); li.loftSections.add(upper.profiles.item(0))
    c.features.loftFeatures.add(li).name='Self-supporting sloped saddle pedestal'
    lower.isVisible=False; upper.isVisible=False
    opening=c.sketches.add(c.xYConstructionPlane); opening.name='Small rail-end ledge around roof opening'
    rect(opening,'-roof_opening/2','-roof_opening/2','roof_opening/2','roof_opening/2')
    peak=c.sketches.add(plane(c,c.xYConstructionPlane,'roof_rise')); peak.name='45 degree roof apex'
    li=c.features.loftFeatures.createInput(F.CutFeatureOperation)
    li.loftSections.add(opening.profiles.item(0)); li.loftSections.add(peak.originPoint)
    c.features.loftFeatures.add(li).name='45 degree internal pyramid - no bridge'
    opening.isVisible=False; peak.isVisible=False
    sk=c.sketches.add(plane(c,c.yZConstructionPlane,'-fin_root_depth/2')); sk.name='Top-centred 90 degree V'
    o=sk.sketchToModelSpace(point(0,0,0)); u=sk.sketchToModelSpace(point(1,0,0)); v=sk.sketchToModelSpace(point(0,1,0))
    uv=[(u.y-o.y,u.z-o.z),(v.y-o.y,v.z-o.z)]
    world=[('-cradle_width/2','saddle_rise'),('cradle_width/2','saddle_rise'),('cradle_width/2','cradle_top'),('cradle_top-v_apex','cradle_top'),('0 mm','v_apex'),('v_apex-cradle_top','cradle_top'),('-cradle_width/2','cradle_top')]
    coords=[]
    for y,z in world:
        coords.append(tuple(('' if (by if abs(by)>.5 else bz)>0 else '-')+'('+(y if abs(by)>.5 else z)+')' for by,bz in uv))
    polygon(sk,coords)
    n=sk.sketchToModelSpace(point(0,0,1))
    extrude(c,sk,'fin_root_depth' if n.x>o.x else '-fin_root_depth',F.JoinFeatureOperation,'Top V - load centred over rail')
    # Both faces converge equally toward the unchanged centre plane.
    for side in [1,-1]:
        sk=c.sketches.add(plane(c,c.xZConstructionPlane,'cradle_width/2')); sk.name='Symmetric fin taper '+str(side)
        o=sk.sketchToModelSpace(point(0,0,0)); u=sk.sketchToModelSpace(point(1,0,0)); v=sk.sketchToModelSpace(point(0,1,0))
        uv=[(u.x-o.x,u.z-o.z),(v.x-o.x,v.z-o.z)]
        sign='' if side==1 else '-'
        world=[(sign+'fin_root_depth/2','saddle_rise'),(sign+'fin_root_depth/2','cradle_top'),(sign+'saddle_depth/2','cradle_top')]
        coords=[]
        for x,z in world:
            coords.append(tuple(('' if (bx if abs(bx)>.5 else bz)>0 else '-')+'('+(x if abs(bx)>.5 else z)+')' for bx,bz in uv))
        polygon(sk,coords)
        n=sk.sketchToModelSpace(point(0,0,1))
        extrude(c,sk,'cradle_width' if (n.y-o.y)*o.y<0 else '-cradle_width',F.CutFeatureOperation,'Symmetric fin taper cut '+str(side))
    body=c.bRepBodies.item(0); body.name='V2 top V cap - print upright twice'
    transform=adsk.core.Matrix3D.create()
    transform.setToRotation(math.pi,adsk.core.Vector3D.create(0,0,1),point(0,0,0))
    transform.translation=adsk.core.Vector3D.create(-7,0,0)
    root.occurrences.addExistingComponent(c,transform)
    t=adsk.core.Matrix3D.create(); t.translation=adsk.core.Vector3D.create(0,6,0)
    coupon=root.occurrences.addNewComponent(t).component; coupon.name='TEST - V2 four-slot fit coupon'
    sleeve(coupon,'coupon_depth'); coupon.bRepBodies.item(0).name='V2 slot coupon - upright'
    design.computeAll(); design.activateRootComponent(); app.activeViewport.fit()
    print(json.dumps({'capBodies':c.bRepBodies.count,'volumeMm3':body.volume*1000,'fullyConstrained':all(s.isFullyConstrained for s in c.sketches),'warnings':[t.name+': '+t.errorOrWarningMessage for t in design.timeline if t.healthState!=adsk.fusion.FeatureHealthStates.HealthyFeatureHealthState]}))
