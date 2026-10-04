"""Fusion MCP: inject OUTPUT_ROOT. Correct the rear lug and fork to a transverse bolt.
Uses the open original lateral Fusion document.
Only the lug, fork above the flat plate, and lug fasteners rotate; pin/case stay put.
"""
import adsk.core, adsk.fusion, json, math, struct
from pathlib import Path

def run(_context: str):
 app=adsk.core.Application.get();out=Path(OUTPUT_ROOT);archive=out/'cad/lateral-dial-holder.f3d'
 source=next(doc for doc in app.documents if doc.name=='probe-dial-lateral' and doc.dataFile)
 d=adsk.fusion.Design.cast(source.products.itemByProductType('DesignProductType'));temp=adsk.fusion.TemporaryBRepManager.get();B=adsk.fusion.BooleanTypes
 pt=lambda x,y,z:adsk.core.Point3D.create(x/10,y/10,z/10)
 def box(z0,z1):
  return temp.createBox(adsk.core.OrientedBoundingBox3D.create(pt(0,0,(z0+z1)/2),adsk.core.Vector3D.create(1,0,0),adsk.core.Vector3D.create(0,1,0),100,100,(z1-z0)/10))
 def rotated(body):
  t=adsk.core.Matrix3D.create();t.setToRotation(math.pi/2,adsk.core.Vector3D.create(0,0,1),pt(-12,0,0));assert temp.transform(body,t);return body
 def rotate_above(body,z,upper):
  a=temp.copy(body);b=temp.copy(body)
  assert temp.booleanOperation(a,box(-1000,z),B.IntersectionBooleanType)
  assert temp.booleanOperation(b,box(z,1000),B.IntersectionBooleanType)
  if upper:b=rotated(b)
  else:a=rotated(a)
  assert temp.booleanOperation(a,b,B.UnionBooleanType);assert a.lumps.count==1;return a
 original=json.loads((out/'src/components/workshop/fusionHolderMeshes.json').read_text());bodies={}
 for c in d.allComponents:
  for b in c.bRepBodies:
   name=('Printable holder' if c.name.startswith('PRINT - V4') else c.name.removeprefix('REF - ')) if b.name=='Body1' else b.name
   if name in original and (name!='Printable holder' or c.name.startswith(('PRINT - V3','PRINT - V4','Holder'))):bodies[name]=temp.copy(b)
 assert set(bodies)==set(original),set(original)-set(bodies)
 dial=bodies['Dial case and rear lug']
 bore=next(adsk.core.Cylinder.cast(f.geometry) for f in dial.faces if adsk.core.Cylinder.cast(f.geometry) and abs(adsk.core.Cylinder.cast(f.geometry).radius-.3425)<1e-6)
 corrected=abs(bore.axis.y)>.9
 if not corrected:
  bodies['Dial case and rear lug']=rotate_above(dial,30,False)
  bodies['Printable holder']=rotate_above(bodies['Printable holder'],8,True)
  for name in bodies:
   if name.startswith('Lug ') or name in ['M5 nut envelope','Left 0.30 mm lug shim','Right 0.30 mm lug shim']:bodies[name]=rotated(bodies[name])
 dial=bodies['Dial case and rear lug']
 cutoff=temp.createBox(adsk.core.OrientedBoundingBox3D.create(pt(480.5,0,0),adsk.core.Vector3D.create(1,0,0),adsk.core.Vector3D.create(0,1,0),103.9,100,100))
 assert temp.booleanOperation(dial,cutoff,B.IntersectionBooleanType)
 for x0,x1,r in [(-39,-59,4),(-59,-74,2)]:
  stem=temp.createCylinderOrCone(pt(x0,0,42.5),r/10,pt(x1,0,42.5),r/10);assert temp.booleanOperation(dial,stem,B.UnionBooleanType)
 # Keep the original flat mounting plate and replace the failed two-ear fork.
 assert temp.booleanOperation(bodies['Printable holder'],box(-1000,8),B.IntersectionBooleanType)
 for name in ['Left 0.30 mm lug shim','Right 0.30 mm lug shim']:
  bodies.pop(name,None)
 def cylinder(a,b,r,bore=0):
  v=temp.createCylinderOrCone(pt(*a),r/10,pt(*b),r/10)
  if bore:assert temp.booleanOperation(v,temp.createCylinderOrCone(pt(*a),bore/10,pt(*b),bore/10),B.DifferenceBooleanType)
  return v
 # Head is on the free side of the ear; nut bears directly against the lug washer.
 bolt=cylinder((-12,11.6,19.75),(-12,-13.4,19.75),2.5)
 assert temp.booleanOperation(bolt,cylinder((-12,11.6,19.75),(-12,16.6,19.75),4.25),B.UnionBooleanType)
 bodies['Lug M5x25 shank']=bolt
 bodies['Lug head washer']=cylinder((-12,10.6,19.75),(-12,11.6,19.75),7.5,2.75)
 bodies['Lug nut washer']=cylinder((-12,-3.6,19.75),(-12,-2.6,19.75),7.5,2.75)
 bodies['M5 nut envelope']=cylinder((-12,-7.6,19.75),(-12,-3.6,19.75),4.6,2.1)
 doc=next((v for v in app.documents if v.name=='probe-dial-lateral' and v.dataFile),None)
 assert doc, 'Open the original probe-dial-lateral Fusion document before regenerating'
 doc.activate();existing=adsk.fusion.Design.cast(app.activeProduct)
 # Preserve any unsaved original edits before replacing generated geometry.
 import tempfile,time
 backup=Path(tempfile.gettempdir())/('probe-dial-lateral-before-regeneration-'+str(time.time_ns())+'.f3d')
 assert existing.exportManager.execute(existing.exportManager.createFusionArchiveExportOptions(str(backup)))
 for occurrence in list(existing.rootComponent.occurrences):assert occurrence.deleteMe()
 while existing.userParameters.count:
     old=existing.userParameters.count
     for parameter in list(existing.userParameters):
         if parameter.isValid:parameter.deleteMe()
     assert existing.userParameters.count<old, 'Referenced parameters remain'
 d=adsk.fusion.Design.cast(app.activeProduct);result={};live={}
 def group(name):
  return 'Holder' if name=='Printable holder' else 'Dial' if name.startswith(('Dial ','Illustrative ')) else 'Nuts and bolts'
 for group_name in ['Holder','Dial','Nuts and bolts']:
  c=d.rootComponent.occurrences.addNewComponent(adsk.core.Matrix3D.create()).component;c.name=group_name
  members=[(name,body) for name,body in bodies.items() if group(name)==group_name]
  base=c.features.baseFeatures.add();base.startEdit()
  for name,body in members:c.bRepBodies.add(body,base)
  base.finishEdit()
  for i,(name,body) in enumerate(members):
   b=base.bodies.item(i);b.name=name;live[name]=b
   assert abs(b.volume-body.volume)<1e-8
  if group_name=='Holder':
   c=live['Printable holder'].parentComponent;val=adsk.core.ValueInput.createByString;F=adsk.fusion.FeatureOperations
   def profile(coords,y,distance,operation,name,rounded=False):
    i=c.constructionPlanes.createInput();i.setByOffset(c.xZConstructionPlane,val(str(-y)+' mm'));plane=c.constructionPlanes.add(i);plane.isLightBulbOn=False
    sk=c.sketches.add(plane);sk.name=name
    points=[sk.modelToSketchSpace(pt(x,y,z)) for x,z in coords]
    if rounded:
     lines=sk.sketchCurves.sketchLines;arcs=sk.sketchCurves.sketchArcs
     lines.addByTwoPoints(points[0],points[1]);lines.addByTwoPoints(points[1],points[2])
     arcs.addByThreePoints(points[2],sk.modelToSketchSpace(pt(-4+2/math.sqrt(2),y,26+2/math.sqrt(2))),points[3])
     lines.addByTwoPoints(points[3],points[4])
     arcs.addByThreePoints(points[4],sk.modelToSketchSpace(pt(-20-2/math.sqrt(2),y,26+2/math.sqrt(2))),points[5])
     lines.addByTwoPoints(points[5],points[0])
    else:
     for a,b in zip(points,points[1:]+points[:1]):sk.sketchCurves.sketchLines.addByTwoPoints(a,b)
    normal=sk.sketchToModelSpace(adsk.core.Point3D.create(0,0,1));origin=sk.sketchToModelSpace(adsk.core.Point3D.create(0,0,0))
    f=c.features.extrudeFeatures.addSimple(sk.profiles.item(0),val(str(distance*(1 if normal.y>origin.y else -1))+' mm'),operation);f.name=name;sk.isVisible=False
   profile([(-22,8),(-2,8),(-2,26),(-4,28),(-20,28),(-22,26)],2.6,8,F.JoinFeatureOperation,'Shortened single 8 mm dial ear with R2 round shoulders',True)
   # Independent root blends, bounded to the mounting ear; no tangent-chain propagation.
   for y,r,name in [(10.6,8,'R8 load-bearing root'),(2.6,2,'R2 dial clearance root')]:
    edges=adsk.core.ObjectCollection.create()
    for edge in c.bRepBodies.item(0).edges:
     bb=edge.boundingBox
     if abs(bb.minPoint.z-.8)<1e-6 and abs(bb.maxPoint.z-.8)<1e-6 and abs(bb.minPoint.y-y/10)<1e-6 and abs(bb.maxPoint.y-y/10)<1e-6 and bb.maxPoint.x-bb.minPoint.x>1:edges.add(edge)
    assert edges.count==1
    f=c.features.filletFeatures.createInput();f.edgeSetInputs.addConstantRadiusEdgeSet(edges,val(str(r)+' mm'),False);c.features.filletFeatures.add(f).name=name
   # A circular local relief only in the added root material preserves the flat washer face.
   i=c.constructionPlanes.createInput();i.setByOffset(c.xZConstructionPlane,val('-10.6 mm'));plane=c.constructionPlanes.add(i);plane.isLightBulbOn=False
   sk=c.sketches.add(plane);sk.name='Local 16 mm washer clearance'
   sk.sketchCurves.sketchCircles.addByCenterRadius(sk.modelToSketchSpace(pt(-12,10.6,19.75)),.8)
   normal=sk.sketchToModelSpace(adsk.core.Point3D.create(0,0,1));origin=sk.sketchToModelSpace(adsk.core.Point3D.create(0,0,0))
   c.features.extrudeFeatures.addSimple(sk.profiles.item(0),val(str(9 if normal.y>origin.y else -9)+' mm'),F.CutFeatureOperation).name='Washer-only circular relief; preserve ear face'
   sk.isVisible=False
   hole=[(-12+2.75*math.cos(math.radians(135+i*270/36)),19.75+2.75*math.sin(math.radians(135+i*270/36))) for i in range(37)]+[(-12,19.75+2.75*math.sqrt(2))]
   profile(hole,2.6,8,F.CutFeatureOperation,'M5 single-ear hole with 45 degree roof')
   live['Printable holder']=c.bRepBodies.item(0);live['Printable holder'].name='Printable holder'
 assert d.rootComponent.occurrences.count==3 and len(live)==len(bodies)
 assert sum(c.bRepBodies.count for c in d.allComponents)==len(bodies)
 for name,b in live.items():
  calc=b.meshManager.createMeshCalculator();calc.surfaceTolerance=.001;m=calc.calculate()
  xyz=[[round(q.x*10,6),round(q.y*10,6),round(q.z*10,6)] for q in m.nodeCoordinates]
  # Workshop frame-bolt placement expects neutral X=55, irrespective of CAD slot position.
  if name.startswith(('Lower','Upper')):
   shift=55-(min(q[0] for q in xyz)+max(q[0] for q in xyz))/2
   xyz=[[round(q[0]+shift,6),q[1],q[2]] for q in xyz]
  result[name]={'positions':[v for q in xyz for v in q],'indices':list(m.nodeIndices),'min':[round(min(q[i] for q in xyz),4) for i in range(3)],'max':[round(max(q[i] for q in xyz),4) for i in range(3)]}
 dial=live['Dial case and rear lug']
 cylinders=[adsk.core.Cylinder.cast(f.geometry) for f in dial.faces if adsk.core.Cylinder.cast(f.geometry)]
 lug=next(c for c in cylinders if abs(c.radius-.3425)<1e-6);pin=next(c for c in cylinders if abs(c.radius-.2)<1e-6)
 assert abs(lug.axis.dotProduct(pin.axis))<1e-8, 'Lug screw must be perpendicular to pin'
 holder=live['Printable holder'];assert holder.isSolid and holder.lumps.count==1
 overlap=temp.copy(holder);assert temp.booleanOperation(overlap,live['Dial case and rear lug'],B.IntersectionBooleanType);assert overlap.volume<1e-8
 (out/'src/components/workshop/fusionHolderMeshes.json').write_text(json.dumps(result,separators=(',',':')))
 m=result['Printable holder'];v=[m['positions'][i:i+3] for i in range(0,len(m['positions']),3)]
 data=bytearray(b'Fusion lateral V5; mm; flat Z=0 bed'.ljust(80,b'\0'));data.extend(struct.pack('<I',len(m['indices'])//3))
 for i in range(0,len(m['indices']),3):
  a,b,c=[v[j] for j in m['indices'][i:i+3]];u=[b[k]-a[k] for k in range(3)];w=[c[k]-a[k] for k in range(3)];n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];length=math.sqrt(sum(x*x for x in n));n=[x/length for x in n] if length else [0,0,0]
  data.extend(struct.pack('<12fH',*n,*a,*b,*c,0))
 (out/'cad/lateral-dial-holder.stl').write_bytes(data)
 assert d.exportManager.execute(d.exportManager.createFusionArchiveExportOptions(str(archive)))
 app.activeViewport.fit()
 print(json.dumps({'document':doc.name,'lugAxis':[0,1,0],'probeAxis':[-1,0,0],'holderVolumeMm3':holder.volume*1000,'holderEnvelope':[m['max'][i]-m['min'][i] for i in range(3)],'dialInterferenceMm3':overlap.volume*1000}))
