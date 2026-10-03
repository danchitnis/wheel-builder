import adsk.core, adsk.fusion, json
def run(_context: str):
 d=adsk.fusion.Design.cast(adsk.core.Application.get().activeProduct)
 result={}
 for c in d.allComponents:
  if c.name.startswith('PRINT - V2') or c.name.startswith('TEST - V2'):
   b=c.bRepBodies.item(0)
   calc=b.meshManager.createMeshCalculator()
   calc.surfaceTolerance=0.002
   mesh=calc.calculate()
   xyz=[[round(p.x*10,6),round(p.z*10,6),round(-p.y*10,6)] for p in mesh.nodeCoordinates]
   result['cap' if c.name.startswith('PRINT -') else 'coupon']={'positions':[v for p in xyz for v in p],'indices':list(mesh.nodeIndices),'min':[min(p[i] for p in xyz) for i in range(3)],'max':[max(p[i] for p in xyz) for i in range(3)],'volumeMm3':b.volume*1000,'solid':b.isSolid}
 print(json.dumps({'meshes':result,'metadata':{'source':adsk.core.Application.get().activeDocument.name,'revision':4,'units':'mm','coordinates':'Fusion X,Z,-Y to workshop X,Y,Z','surfaceToleranceMm':0.02,'parameters':{p.name:round(p.value*10,6) for p in d.userParameters if not p.name.startswith('v1_')}}}))
