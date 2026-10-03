"""Fusion geometry checks; inject OUTPUT_ROOT. No physical or slicer validation implied."""
import adsk.core, adsk.fusion, json, math
from pathlib import Path


def run(_context: str):
    d=adsk.fusion.Design.cast(adsk.core.Application.get().activeProduct)
    bodies={b.name:b for c in d.allComponents for b in c.bRepBodies};temp=adsk.fusion.TemporaryBRepManager.get()
    prints=['Radial printable bridge','Radial printable C-holder']
    for n in prints:
        b=bodies[n];assert b.isSolid and b.lumps.count==1 and b.lumps.item(0).isClosed
    def moved(name,x,angle):
        b=temp.copy(bodies[name]);t=adsk.core.Matrix3D.create()
        t.setToRotation(-math.radians(angle),adsk.core.Vector3D.create(1,0,0),adsk.core.Point3D.create(6.2,-2.6,2));assert temp.transform(b,t)
        t=adsk.core.Matrix3D.create();t.translation=adsk.core.Vector3D.create((x-62)/10,0,0);assert temp.transform(b,t);return b
    checks=[];failures=[]
    def check(a,b,label):
        a=temp.copy(a);assert temp.booleanOperation(a,b,adsk.fusion.BooleanTypes.IntersectionBooleanType)
        volume=a.volume*1000
        row={'pair':label,'overlapMm3':volume};checks.append(row)
        if volume>1e-5:failures.append(row)
    for x in [62]:
        for angle in [0,5,10,15,20,25]:
            carriage=moved(prints[1],x,angle);dial=moved('Radial dial case and rear lug',x,angle)
            check(bodies[prints[0]],carriage,f'bridge/C x={x} angle={angle}')
            check(bodies[prints[0]],dial,f'bridge/dial x={x} angle={angle}')
            check(carriage,dial,f'C/dial x={x} angle={angle}')
            for name in ['Lug M5x16 bolt','Lug M5 head','Lug M5 nut envelope','Pivot M5x25 bolt','Pivot M5 head','Pivot M5 nut envelope']:
                check(carriage,moved(name,x,angle),f'C/{name} x={x} angle={angle}')
    for x in [108,118.5,134.5,145]:
        for name in ['Right M5x16 bolt','Right M5 head','Right M5 washer']:
            b=temp.copy(bodies[name]);t=adsk.core.Matrix3D.create();t.translation=adsk.core.Vector3D.create((x-125)/10,0,0);temp.transform(b,t)
            check(bodies[prints[0]],b,f'bridge/{name} x={x}')
    for x in [-21,0,16]:
        for name in ['Left lower M5x16 bolt','Left upper M5x16 bolt','Left lower M5 head','Left upper M5 head','Left lower M5 washer','Left upper M5 washer']:
            b=temp.copy(bodies[name]);t=adsk.core.Matrix3D.create();t.translation=adsk.core.Vector3D.create(x/10,0,0);temp.transform(b,t)
            check(bodies[prints[0]],b,f'bridge/{name} x={x}')
    # A 10 mm driver envelope approaches the lug screw from behind without
    # touching either pivot cheek, the arm, dial or pivot hardware.
    for angle in [0,5,10,15,20,25]:
        tool=temp.createCylinderOrCone(adsk.core.Point3D.create(6.2,-10,2.975),.5,adsk.core.Point3D.create(6.2,-1.14,2.975),.5)
        t=adsk.core.Matrix3D.create();t.setToRotation(-math.radians(angle),adsk.core.Vector3D.create(1,0,0),adsk.core.Point3D.create(6.2,-2.6,2));temp.transform(tool,t)
        for name in [prints[0],'Pivot M5x25 bolt','Pivot M5 nut envelope']:
            check(bodies[name],tool,f'{name}/10 mm driver at {angle} degrees')
        for name in [prints[1],'Radial dial case and rear lug']:
            check(moved(name,62,angle),tool,f'{name}/10 mm driver at {angle} degrees')
    report={'revision':8,'connectedClosedPrintedSolids':2,'interferenceChecks':len(checks),'failures':failures,'printOrientation':'Bridge on flat back; dial arm on broad X=47 face, both STLs at Z=0','supportRequiredByGeometry':'See mesh normal test','slicerVerified':False,'physicalPrintTested':False,'note':'Mesh manifold and overhang checks in radialHolder.test.ts. Nut envelopes are conservative cylinders; actual hardware, stiffness and repeatability require physical verification.'}
    (Path(OUTPUT_ROOT)/'cad/radial-print-verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));assert not failures
