"""Reproduce a generic geometry-validation slice. Not production printer G-code."""
import json, os, re, subprocess, tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
engine=os.environ.get('RADIAL_CURA_ENGINE','/Applications/UltiMaker Cura.app/Contents/Frameworks/CuraEngine')
definition=os.environ.get('RADIAL_CURA_DEFINITION','/Applications/UltiMaker Cura.app/Contents/Resources/share/cura/resources/definitions/fdmprinter.def.json')
settings={'machine_width':200,'machine_depth':200,'machine_height':200,'machine_center_is_zero':'false','center_object':'false','mesh_position_x':10,'mesh_position_y':10,'layer_height':.2,'layer_height_0':.2,'line_width':.4,'wall_line_count':4,'top_layers':5,'bottom_layers':5,'roofing_layer_count':0,'flooring_layer_count':0,'infill_sparse_density':25,'infill_line_distance':1.6,'material_diameter':1.75,'support_enable':'false','adhesion_type':'none'}
output=Path(tempfile.gettempdir())/'radial-v8-validation.gcode';log=output.with_suffix('.log')
args=[engine,'slice','-j',definition]
for k,v in settings.items():args+=['-s',f'{k}={v}']
args+=['-l',str(root/'cad/radial-dial-holder.stl'),'-o',str(output)]
with log.open('w') as f:subprocess.run(args,stdout=f,stderr=subprocess.STDOUT,check=True)
s=output.read_text();types=sorted(set(re.findall(r'^;TYPE:(.+)',s,re.M)));layers=[int(x) for x in re.findall(r'^;LAYER:(-?\d+)',s,re.M)]
assert layers and len(layers)==160
assert not any('SUPPORT' in t for t in types)
report_path=root/'cad/radial-print-verification.json';report=json.loads(report_path.read_text())
report.update(slicerVerified=True,supportRequiredByGeometry=False,slice={'engine':'CuraEngine 5.13.0','settings':settings,'layers':len(layers),'pathTypes':types,'supportPaths':0,'maximumZMm':32,'note':'Generic validation only. Load the STLs into the intended printer/material profile before production.'})
report_path.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report['slice'],indent=2))
