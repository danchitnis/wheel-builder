"""Fusion MCP export: inject OUTPUT_ROOT. Native meshes remain unscaled and untilted.
Per-body motion tags drive rigid assembly transforms. Both STLs have Z=0 backs.
"""
import adsk.core, adsk.fusion, json, math, struct
from pathlib import Path


def run(_context: str):
    app=adsk.core.Application.get();d=adsk.fusion.Design.cast(app.activeProduct)
    assert app.activeDocument.name.startswith('probe-dial-radial')
    root=d.rootComponent;temp=adsk.fusion.TemporaryBRepManager.get();pt=lambda x,y,z:adsk.core.Point3D.create(x/10,y/10,z/10)
    p={v.name:v.value*(180/math.pi if v.unit=='deg' else 10) for v in d.userParameters}
    if not any(c.name=='REF - radial mounting hardware' for c in d.allComponents):
        c=root.occurrences.addNewComponent(adsk.core.Matrix3D.create()).component;c.name='REF - radial mounting hardware'
        base=c.features.baseFeatures.add();base.startEdit()
        def cylinder(name,a,b,r,bore=0):
            body=temp.createCylinderOrCone(pt(*a),r/10,pt(*b),r/10)
            if bore:
                hole=temp.createCylinderOrCone(pt(*a),bore/10,pt(*b),bore/10);assert temp.booleanOperation(body,hole,adsk.fusion.BooleanTypes.DifferenceBooleanType)
            added=c.bRepBodies.add(body,base);added.name=name
        for name,x,y in [('Left lower',0,-69),('Left upper',0,-51),('Right',125,-60)]:
            cylinder(name+' M5x16 bolt',(x,y,9),(x,y,-7),2.5)
            cylinder(name+' M5 head',(x,y,9),(x,y,14),4.25)
            cylinder(name+' M5 washer',(x,y,8),(x,y,9),5,2.75)
            cylinder(name+' M5 T-nut envelope',(x,y,-6),(x,y,-2),5,2.1)
        x=p['dial_reference_x'];z=29.75
        cylinder('Lug M5x16 bolt',(x,-6.4,z),(x,9.6,z),2.5)
        cylinder('Lug M5 head',(x,-11.4,z),(x,-6.4,z),4.25)
        cylinder('Lug rear washer',(x,-6.4,z),(x,-5.4,z),5,2.75)
        cylinder('Lug front washer',(x,2.6,z),(x,3.6,z),5,2.75)
        cylinder('Lug M5 nut envelope',(x,3.6,z),(x,7.6,z),4.6,2.1)
        y=p['pivot_y'];z=p['pivot_z'];x=p['pivot_fixed_x']
        cylinder('Pivot M5x25 bolt',(x-1,y,z),(x+24,y,z),2.5)
        cylinder('Pivot M5 head',(x-6,y,z),(x-1,y,z),4.25)
        cylinder('Pivot left washer',(x-1,y,z),(x,y,z),5,2.75)
        cylinder('Pivot right washer',(x+12.4,y,z),(x+13.4,y,z),5,2.75)
        cylinder('Pivot M5 nut envelope',(x+13.4,y,z),(x+17.4,y,z),4.6,2.1)
        base.finishEdit()
    result={};print_components=[]
    for c in d.allComponents:
        if c.name.startswith('PRINT -'):print_components.append(c)
        for b in c.bRepBodies:
            calc=b.meshManager.createMeshCalculator();calc.surfaceTolerance=.001;mesh=calc.calculate()
            xyz=[[round(q.x*10,6),round(q.y*10,6),round(q.z*10,6)] for q in mesh.nodeCoordinates]
            name=b.name
            motion='slide-tilt' if name in ['Radial printable C-holder','Radial dial case and rear lug'] or name.startswith('Lug ') else 'slide' if name=='Radial printable bridge' or name.startswith('Pivot ') else 'fixed'
            result[name]={'positions':[v for q in xyz for v in q],'indices':list(mesh.nodeIndices),'min':[min(q[i] for q in xyz) for i in range(3)],'max':[max(q[i] for q in xyz) for i in range(3)],'volumeMm3':b.volume*1000,'solid':b.isSolid,'motion':motion,'printOrientation':'X=47 broad arm face' if name=='Radial printable C-holder' else 'Z=0 back'}
    assert len(print_components)==2 and all(c.bRepBodies.count==1 for c in print_components)
    out=Path(OUTPUT_ROOT);volume=sum(result[c.bRepBodies.item(0).name]['volumeMm3'] for c in print_components)
    data={'meshes':result,'metadata':{'source':'probe-dial-radial','revision':8,'units':'mm','coordinates':'Neutral Fusion XYZ. Rigid rotation about X at Y=-26,Z=20; translate whole bridge along X. Print +Z up.','surfaceToleranceMm':.01,'parameters':p,'printedVolumeMm3':volume,'previousVolumeMm3':67688.7788,'volumeReductionPercent':100*(1-volume/67688.7788)}}
    (out/'src/components/workshop/fusionRadialHolderMeshes.json').write_text(json.dumps(data,separators=(',',':')))
    def stl(path,parts):
        tris=[]
        for name,delta in parts:
            m=result[name];native=[m['positions'][i:i+3] for i in range(0,len(m['positions']),3)]
            vertices=[[m['max'][2]-q[2]+delta[0],q[1]-m['min'][1]+delta[1],q[0]-m['min'][0]] if name=='Radial printable C-holder' else [q[j]+delta[j] for j in range(3)] for q in native]
            for i in range(0,len(m['indices']),3):tris.append([vertices[j] for j in m['indices'][i:i+3]])
        output=bytearray(b'Fusion radial V8; millimetres; flat Z=0 bed'.ljust(80,b'\0'));output.extend(struct.pack('<I',len(tris)))
        for a,b,c in tris:
            u=[b[k]-a[k] for k in range(3)];v=[c[k]-a[k] for k in range(3)];n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];length=sum(x*x for x in n)**.5;n=[x/length for x in n] if length else [0,0,0]
            output.extend(struct.pack('<12fH',*n,*a,*b,*c,0))
        (out/'cad'/path).write_bytes(output)
    stl('radial-bridge.stl',[('Radial printable bridge',[28,78,0])])
    stl('radial-c-holder.stl',[('Radial printable C-holder',[0,0,0])])
    stl('radial-dial-holder.stl',[('Radial printable bridge',[28,78,0]),('Radial printable C-holder',[0,75,0])])
    assert d.exportManager.execute(d.exportManager.createSTEPExportOptions(str(out/'cad/radial-dial-holder.step')))
    assert d.exportManager.execute(d.exportManager.createFusionArchiveExportOptions(str(out/'cad/radial-dial-holder.f3d')))
    app.activeViewport.fit()
    print(json.dumps({'meshCount':len(result),'printVolumes':{k:v['volumeMm3'] for k,v in result.items() if k.startswith('Radial printable')},'volumeReductionPercent':data['metadata']['volumeReductionPercent'],'combinedPrintEnvelope':[180,75+result['Radial printable C-holder']['max'][1]-result['Radial printable C-holder']['min'][1],32]}))
