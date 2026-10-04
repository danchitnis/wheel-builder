"""Fusion MCP: inject OUTPUT_ROOT. Export the open probe1; no model changes."""
import adsk.core, adsk.fusion, json, struct
from pathlib import Path


def run(_context: str):
    app=adsk.core.Application.get()
    assert app.activeDocument.name.lower().replace(' ','').startswith('probe1')
    design=adsk.fusion.Design.cast(app.activeProduct)
    assert design.rootComponent.bRepBodies.count==1
    body=design.rootComponent.bRepBodies.item(0)
    calc=body.meshManager.createMeshCalculator();calc.surfaceTolerance=.001
    mesh=calc.calculate()
    vertices=[[round(q.x*10,6),round(q.y*10,6),round(q.z*10,6)] for q in mesh.nodeCoordinates]
    indices=list(mesh.nodeIndices)
    data={'metadata':{'source':app.activeDocument.name,'units':'mm','surfaceToleranceMm':.01,'slotMin':5,'slotMax':95,'slotWidth':5,'baseThickness':5,'contactX':100,'boltMin':7,'boltMax':93},'mesh':{'positions':[v for q in vertices for v in q],'indices':indices,'min':[min(q[i] for q in vertices) for i in range(3)],'max':[max(q[i] for q in vertices) for i in range(3)],'volumeMm3':body.volume*1000,'solid':body.isSolid}}
    out=Path(OUTPUT_ROOT)
    (out/'src/components/workshop/fusionProbe1Mesh.json').write_text(json.dumps(data,separators=(',',':')))
    stl=bytearray(b'Fusion probe1; native millimetres; flat Z=0 bed'.ljust(80,b'\0'));stl.extend(struct.pack('<I',len(indices)//3))
    for i in range(0,len(indices),3):
        a,b,c=[vertices[j] for j in indices[i:i+3]]
        u=[b[k]-a[k] for k in range(3)];v=[c[k]-a[k] for k in range(3)]
        n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];length=sum(x*x for x in n)**.5
        n=[x/length for x in n] if length else [0,0,0]
        stl.extend(struct.pack('<12fH',*n,*a,*b,*c,0))
    (out/'cad/probe1.stl').write_bytes(stl)
    print(json.dumps({'source':data['metadata'],'min':data['mesh']['min'],'max':data['mesh']['max'],'triangles':len(indices)//3,'volumeMm3':body.volume*1000,'solid':body.isSolid}))
