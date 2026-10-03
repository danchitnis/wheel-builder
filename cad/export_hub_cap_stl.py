"""Regenerate printable binary STL files from the measured Fusion export.
Run with Python from any directory after updating fusionHubCapMeshes.json.
"""
import json
from pathlib import Path
import struct

folder = Path(__file__).resolve().parent
data = json.loads((folder.parent / 'src/components/workshop/fusionHubCapMeshes.json').read_text())
for name, mesh in data['meshes'].items():
    vertices = [mesh['positions'][i:i+3] for i in range(0,len(mesh['positions']),3)]
    # Both parts print upright: collar opening on bed, workshop Y becomes print Z.
    vertices = [(x,-z,y-mesh['min'][1]) for x,y,z in vertices]
    triangles = mesh['indices']
    output = bytearray(('Fusion V2 '+name+'; mm; print orientation; verify fit').encode().ljust(80,b'\0'))
    output.extend(struct.pack('<I',len(triangles)//3))
    for i in range(0,len(triangles),3):
        a,b,c = [vertices[j] for j in triangles[i:i+3]]
        u=[b[k]-a[k] for k in range(3)]; v=[c[k]-a[k] for k in range(3)]
        normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        length=sum(n*n for n in normal)**.5
        normal=[n/length for n in normal] if length else [0,0,0]
        output.extend(struct.pack('<12fH',*normal,*a,*b,*c,0))
    path=folder/('2020-hub-'+name+'.stl')
    path.write_bytes(output)
    print(path.name, len(triangles)//3, 'triangles')
