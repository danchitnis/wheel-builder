"""Fusion MCP: verify the single-ear lateral assembly; inject OUTPUT_ROOT."""
import adsk.core, adsk.fusion, json
from pathlib import Path

def run(_context: str):
 app=adsk.core.Application.get();doc=next(v for v in app.documents if v.name=='probe-dial-lateral');doc.activate();d=adsk.fusion.Design.cast(app.activeProduct)
 bodies={b.name:b for c in d.allComponents for b in c.bRepBodies};t=adsk.fusion.TemporaryBRepManager.get();B=adsk.fusion.BooleanTypes
 holder=bodies['Printable holder'];assert holder.isSolid and holder.lumps.count==1 and holder.lumps.item(0).isClosed
 assert set(c.name for c in d.allComponents if c!=d.rootComponent)=={'Holder','Dial','Nuts and bolts'}
 assert len(bodies)==14 and not any('shim' in name for name in bodies)
 fillets=[adsk.core.Cylinder.cast(f.geometry) for f in holder.faces if adsk.core.Cylinder.cast(f.geometry)]
 assert any(abs(f.radius-.8)<1e-6 for f in fillets) and any(abs(f.radius-.2)<1e-6 for f in fillets)
 bolt=bodies['Lug M5x25 shank'];assert abs((bolt.boundingBox.maxPoint.y-bolt.boundingBox.minPoint.y)*10-30)<1e-5
 # The full outer bearing ring of the 15 mm washer must sit on a flat ear face.
 ring=t.createCylinderOrCone(adsk.core.Point3D.create(-1.2,1.059,1.975),.75,adsk.core.Point3D.create(-1.2,1.06,1.975),.75)
 bore=t.createCylinderOrCone(adsk.core.Point3D.create(-1.2,1.059,1.975),.4,adsk.core.Point3D.create(-1.2,1.06,1.975),.4)
 assert t.booleanOperation(ring,bore,B.DifferenceBooleanType);expected=ring.volume
 assert t.booleanOperation(ring,holder,B.IntersectionBooleanType);assert abs(ring.volume-expected)<1e-8
 checks=[]
 def check(a,b,label):
  v=t.copy(a);assert t.booleanOperation(v,b,B.IntersectionBooleanType);checks.append({'pair':label,'overlapMm3':v.volume*1000});assert v.volume<1e-8,label
 check(holder,bodies['Dial case and rear lug'],'holder/dial')
 for name in ['Lug M5x25 shank','Lug head washer','Lug nut washer','M5 nut envelope']:
  for target in ['Printable holder','Dial case and rear lug']:check(bodies[target],bodies[name],target+'/'+name)
 tool=t.createCylinderOrCone(adsk.core.Point3D.create(-1.2,1.66,1.975),.5,adsk.core.Point3D.create(-1.2,10,1.975),.5)
 for target in ['Printable holder','Dial case and rear lug']:check(bodies[target],tool,target+'/10 mm driver')
 report={'revision':5,'connectedClosedPrintedSolids':1,'earThicknessMm':8,'lugWasherDiameterMm':15,'washerOuterBearingRingFullySupported':True,'outerRootFilletMm':8,'washerReliefDiameterMm':16,'dialSideFilletMm':2,'printEnvelopeMm':[82,82,28],'interferenceChecks':checks,'physicalPrintTested':False}
 (Path(OUTPUT_ROOT)/'cad/lateral-print-verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
