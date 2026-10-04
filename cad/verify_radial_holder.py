"""Fusion checks for the one-piece holder; inject OUTPUT_ROOT."""
import adsk.core, adsk.fusion, json, math
from pathlib import Path

def run(_context: str):
 doc=next(v for v in adsk.core.Application.get().documents if v.name=='probe-dial-radial' and v.dataFile)
 d=adsk.fusion.Design.cast(doc.products.itemByProductType('DesignProductType'))
 bodies={b.name:b for c in d.allComponents for b in c.bRepBodies};temp=adsk.fusion.TemporaryBRepManager.get();B=adsk.fusion.BooleanTypes
 holder=bodies['Radial printable bridge'];assert holder.isSolid and holder.lumps.count==1 and holder.lumps.item(0).isClosed
 assert len([c for c in d.allComponents if c.name.startswith('PRINT -')])==1
 root_fillets=[adsk.core.Cylinder.cast(f.geometry) for f in holder.faces if adsk.core.Cylinder.cast(f.geometry) and abs(adsk.core.Cylinder.cast(f.geometry).radius-.8)<1e-6 and abs(adsk.core.Cylinder.cast(f.geometry).axis.z)>.99 and any(abs(adsk.core.Cylinder.cast(f.geometry).origin.x-x)<1e-6 for x in [3.54,7.54])]
 assert len(root_fillets)==2, 'Both R8 bridge-root fillets must be present'
 # The projecting arm must retain eight millimetres of solid material up to the rounded end corners.
 arm=temp.createBox(adsk.core.OrientedBoundingBox3D.create(adsk.core.Point3D.create(5.54,-1.025,.4),adsk.core.Vector3D.create(1,0,0),adsk.core.Vector3D.create(0,1,0),2.4,3.55,.8))
 arm_volume=arm.volume
 assert temp.booleanOperation(arm,holder,B.IntersectionBooleanType)
 assert abs(arm.volume-arm_volume)<1e-8, 'Projecting arm has a recess or reduced thickness'
 end_fillets=[adsk.core.Cylinder.cast(f.geometry) for f in holder.faces if adsk.core.Cylinder.cast(f.geometry) and abs(adsk.core.Cylinder.cast(f.geometry).radius-.25)<1e-6 and abs(adsk.core.Cylinder.cast(f.geometry).axis.z)>.99]
 assert len(end_fillets)==2, 'Both user-added R2.5 arm-end fillets must be present'
 dial=bodies['Radial dial case and rear lug']
 cylinders=[adsk.core.Cylinder.cast(f.geometry) for f in dial.faces if adsk.core.Cylinder.cast(f.geometry)]
 lug=next(c for c in cylinders if abs(c.radius-.3425)<1e-6);pin=next(c for c in cylinders if abs(c.radius-.2)<1e-6)
 assert abs(lug.axis.dotProduct(pin.axis))<1e-8
 ring=temp.createCylinderOrCone(adsk.core.Point3D.create(5.14,0,2.075),.75,adsk.core.Point3D.create(5.141,0,2.075),.75)
 bore=temp.createCylinderOrCone(adsk.core.Point3D.create(5.14,0,2.075),.4,adsk.core.Point3D.create(5.141,0,2.075),.4)
 assert temp.booleanOperation(ring,bore,B.DifferenceBooleanType);expected=ring.volume
 assert temp.booleanOperation(ring,holder,B.IntersectionBooleanType);assert abs(ring.volume-expected)<1e-8
 checks=[];failures=[]
 def check(a,b,label):
  a=temp.copy(a);assert temp.booleanOperation(a,b,B.IntersectionBooleanType)
  row={'pair':label,'overlapMm3':a.volume*1000};checks.append(row)
  if row['overlapMm3']>1e-5:failures.append(row)
 for angle in [0,5,10,15,20,25]:
  b=temp.copy(dial);t=adsk.core.Matrix3D.create();t.setToRotation(-math.radians(angle),adsk.core.Vector3D.create(1,0,0),adsk.core.Point3D.create(6.2,0,2.075));assert temp.transform(b,t)
  check(holder,b,f'holder/dial at {angle} degrees')
  for name,hardware in bodies.items():
   if name.startswith('Lug '):check(b,hardware,f'dial/{name} at {angle} degrees')
  tool=temp.createCylinderOrCone(adsk.core.Point3D.create(-4,0,2.075),.5,adsk.core.Point3D.create(4.54,0,2.075),.5)
  check(holder,tool,'holder/10 mm lug driver');check(b,tool,f'dial/10 mm lug driver at {angle}')
 for name,b in bodies.items():
  if name.startswith('Lug '):check(holder,b,'holder/'+name)
 for x in [108,118.5,134.5,145]:
  for name in ['Right M5x16 bolt','Right M5 head','Right M5 washer']:
   b=temp.copy(bodies[name]);t=adsk.core.Matrix3D.create();t.translation=adsk.core.Vector3D.create((x-125)/10,0,0);temp.transform(b,t);check(holder,b,f'{name} at {x}')
 for x in [-21,0,16]:
  for name in ['Left lower M5x16 bolt','Left upper M5x16 bolt','Left lower M5 head','Left upper M5 head','Left lower M5 washer','Left upper M5 washer']:
   b=temp.copy(bodies[name]);t=adsk.core.Matrix3D.create();t.translation=adsk.core.Vector3D.create(x/10,0,0);temp.transform(b,t);check(holder,b,f'{name} at {x}')
 report={'revision':13,'armEndCornerRadiusMm':2.5,'solidProjectingArmThicknessMm':8,'lugWasherDiameterMm':15,'washerOuterBearingRingFullySupported':True,'connectedClosedPrintedSolids':1,'bridgeRootFillets':{'count':len(root_fillets),'radiusMm':8},'lugAxis':lug.axis.asArray(),'probeAxis':pin.axis.asArray(),'lugProbeDotProduct':lug.axis.dotProduct(pin.axis),'interferenceChecks':len(checks),'failures':failures,'printOrientation':'Single flat Z=0 bed face; single mounting ear upright','supportRequiredByGeometry':'See mesh normal test','slicerVerified':False,'physicalPrintTested':False,'note':'Direct dial-lug bolt provides angle adjustment. Physical bolt fit, friction and stiffness require verification.'}
 (Path(OUTPUT_ROOT)/'cad/radial-print-verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));assert not failures
