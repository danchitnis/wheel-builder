import * as THREE from 'three';
import fusionHolderMeshes from './fusionHolderMeshes.json';
import radialExport from './fusionRadialHolderMeshes.json';
import hubCapExport from './fusionHubCapMeshes.json';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Assembly, Part } from '../../utils/workshop';

const colors = { extrusion:0xa8b6c8, pla:0x16b8b1, metal:0x8796a8, hardware:0xa4adba, gauge:0xf6bd60 };
export class WorkshopViewer {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40,1,1,12000);
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private group = new THREE.Group();
  private wheel = new THREE.Group();
  private labels = new THREE.Group();
  private meshes = new Map<string,THREE.Group>();
  private parts: Part[] = [];
  private frame = 0;
  private resize: ResizeObserver;
  private explode = 0;
  private selected: string[] = [];
  private wheelOrigin = new THREE.Vector3();
  private wheelLift = 0;
  private reversed = false;
  private center = new THREE.Vector3();
  private span = 1000;
  private inspection: {target:THREE.Vector3;distance:number}|undefined;
  private down = [0,0];
  constructor(private container:HTMLElement, private onSelect:(id:string)=>void) {
    this.renderer = new THREE.WebGLRenderer({antialias:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.setClearColor(0x0b111a);
    this.renderer.domElement.style.cssText='width:100%;height:100%;display:block;touch-action:none';
    this.renderer.domElement.setAttribute('aria-label','Workshop assembly. Drag to rotate, scroll to zoom, right drag to pan. Use camera buttons for keyboard control.');
    container.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping=true;
    this.controls.minDistance=80; this.controls.maxDistance=6000;
    this.scene.add(new THREE.HemisphereLight(0xe2f2ff,0x263441,2.8));
    const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(600,1200,800);this.scene.add(light);
    const back=new THREE.DirectionalLight(0x96d9ff,2);back.position.set(-700,500,-500);this.scene.add(back);
    const grid=new THREE.GridHelper(2000,40,0x263445,0x182332);grid.position.y=-2;this.scene.add(grid);
    this.scene.add(this.group,this.wheel,this.labels);
    this.resize=new ResizeObserver(()=>this.size());this.resize.observe(container);this.size();
    this.renderer.domElement.addEventListener('pointerdown',this.pointerDown);
    this.renderer.domElement.addEventListener('pointerup',this.pointerUp);
    this.renderer.domElement.addEventListener('webglcontextlost',this.contextLost);
    this.animate();
  }
  private contextLost=(event:Event)=>{event.preventDefault();cancelAnimationFrame(this.frame);this.container.dispatchEvent(new CustomEvent('viewer-lost'));};
  private pointerDown=(e:PointerEvent)=>{this.down=[e.clientX,e.clientY];};
  private pointerUp=(e:PointerEvent)=>{
    if(Math.hypot(e.clientX-this.down[0],e.clientY-this.down[1])>5) return;
    const rect=this.renderer.domElement.getBoundingClientRect();
    const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),this.camera);
    const hit=ray.intersectObjects([...this.meshes.values()],true)[0];
    if(hit){let obj:THREE.Object3D|null=hit.object;while(obj&&!obj.userData.partId)obj=obj.parent;if(obj)this.onSelect(obj.userData.partId);}
  };
  private size(){const {clientWidth:w,clientHeight:h}=this.container;if(!w||!h)return;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);}
  private clear(g:THREE.Group){g.traverse(obj=>{if(obj instanceof THREE.Mesh||obj instanceof THREE.LineSegments||obj instanceof THREE.Sprite){obj.geometry?.dispose();for(const m of Array.isArray(obj.material)?obj.material:[obj.material]){if('map'in m&&(m.map instanceof THREE.Texture))m.map.dispose();m.dispose();}}});g.clear();}
  private material(color:number){return new THREE.MeshStandardMaterial({color,metalness:.35,roughness:.5});}
  private box(size:number[],color:number){return new THREE.Mesh(new THREE.BoxGeometry(...size as [number,number,number]),this.material(color));}
  private cylinder(radius:number,length:number,color:number,axis='y',segments=20){
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,segments),this.material(color));
    if(axis==='x')mesh.rotation.z=Math.PI/2;if(axis==='z')mesh.rotation.x=Math.PI/2;return mesh;
  }
  private drilledPlate(width:number,height:number,thickness:number,holes:{x:number;y:number;r:number}[],axis='z') {
    const shape=new THREE.Shape();shape.moveTo(-width/2,-height/2);shape.lineTo(width/2,-height/2);shape.lineTo(width/2,height/2);shape.lineTo(-width/2,height/2);shape.closePath();
    for(const h of holes){const hole=new THREE.Path();hole.absarc(h.x,h.y,h.r,0,Math.PI*2,true);shape.holes.push(hole);}
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,curveSegments:20});geometry.translate(0,0,-thickness/2);
    if(axis==='x')geometry.rotateY(Math.PI/2);if(axis==='y')geometry.rotateX(-Math.PI/2);
    return geometry;
  }
  private dialFace() {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#eef2e9';ctx.beginPath();ctx.arc(128,128,125,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#15222f';ctx.fillStyle='#15222f';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='18px sans-serif';
    for(let i=0;i<100;i++){const t=i*Math.PI/50-Math.PI/2;const r=i%10===0?91:101;ctx.lineWidth=i%10===0?3:1;ctx.beginPath();ctx.moveTo(128+Math.cos(t)*r,128+Math.sin(t)*r);ctx.lineTo(128+Math.cos(t)*113,128+Math.sin(t)*113);ctx.stroke();if(i%10===0)ctx.fillText(String(i),128+Math.cos(t)*77,128+Math.sin(t)*77);}
    ctx.font='14px sans-serif';ctx.fillText('0.01 mm',128,160);ctx.font='10px sans-serif';ctx.fillText('ILLUSTRATION',128,183);
    ctx.strokeStyle='#c54830';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(128,146);ctx.lineTo(128,38);ctx.stroke();ctx.fillStyle='#15222f';ctx.beginPath();ctx.arc(128,128,7,0,Math.PI*2);ctx.fill();
    return new THREE.Mesh(new THREE.CircleGeometry(25,64),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas)}));
  }
  private part(p:Part){
    const g=new THREE.Group();g.userData.partId=p.id;
    let mesh:THREE.Mesh;
    const block=(dims:number[],pos:number[])=>{const m=this.box(dims,colors[p.kind]);m.position.fromArray(pos);g.add(m);return m;};
    if(p.shape==='fusion-mesh' && (p.meshKey||p.radialMeshKey)){
      const source=p.radialMeshKey?radialExport.meshes[p.radialMeshKey]:fusionHolderMeshes[p.meshKey!];
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(source.positions,3));
      geometry.setIndex(source.indices);
      geometry.translate(...source.min.map((v,i)=>-(v+source.max[i])/2) as [number,number,number]);
      // CAD face boundaries are duplicated in the tessellation, preserving sharp edges.
      geometry.computeVertexNormals();
      mesh=new THREE.Mesh(geometry,this.material(p.meshKey==='Illustrative dial face'?0xeef2e9:p.meshKey==='Illustrative needle'?0xc54830:colors[p.kind]));g.add(mesh);
      if(p.meshKey==='Dial case and rear lug'){
        const face=this.dialFace();face.position.set(-12-(source.min[0]+source.max[0])/2,0,22.55);g.add(face);
      }
      if(p.radialMeshKey==='Radial dial case and rear lug'){
        const face=this.dialFace(),p=radialExport.metadata.parameters;
        face.position.set(p.dial_reference_x-(source.min[0]+source.max[0])/2,-(source.min[1]+source.max[1])/2,p.case_rear+p.carriage_back+p.dial_thickness+.05-(source.min[2]+source.max[2])/2);g.add(face);
      }
    }else if(p.shape==='angle'){
      const L=p.size[0],q=L/2,r=(p.bore??7)/2;
      mesh=new THREE.Mesh(this.drilledPlate(L,L,4,[{x:q-L/2,y:0,r}],'y'),this.material(colors.metal));mesh.position.set(L/2,2,0);g.add(mesh);
      const upright=new THREE.Mesh(this.drilledPlate(L,L,4,[{x:0,y:q-L/2,r}],'x'),this.material(colors.metal));upright.position.set(2,L/2,0);g.add(upright);
    }else if(p.shape==='top-cap' && p.capDesign==='centred-v2'){
      const source=hubCapExport.meshes.cap;
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(source.positions,3));
      geometry.setIndex(source.indices);
      geometry.computeVertexNormals();
      // Export origin is the rail-end datum, not the mesh bounding-box centre.
      mesh=new THREE.Mesh(geometry,this.material(colors.pla));g.add(mesh);
    }else if(p.shape==='top-cap'){
      const P=p.profileSize!,fit=p.fit??0,inside=P+fit,wall=(P+20-inside)/2;
      // Hollow, open-front sleeve. The rail end contacts the underside at Y=0.
      mesh=block([P,6,P+20],[P/2,3,0]);
      block([6,40,P+20],[P+3+fit,-20,0]);
      for(const sign of [-1,1]){
        const skirt=new THREE.Mesh(this.drilledPlate(P+6,40,wall,[{x:-3,y:8,r:4.5},{x:-3,y:-10,r:4.5}]),this.material(colors.pla));
        skirt.position.set(P/2+3,-20,sign*(inside/2+wall/2));g.add(skirt);
        const opening=Math.max(26,p.bore??10),cheek=(P+20-opening)/2;
        block([P,19,cheek],[P/2,15.5,sign*(opening/2+cheek/2)]);
      }
      const r=(p.bore??10)/2,cy=(p.seatHeight??10)+r,half=(P+20)/2;
      const shape=new THREE.Shape();shape.moveTo(-half,0);shape.lineTo(half,0);shape.lineTo(half,29);shape.lineTo(r,29);shape.lineTo(r,cy);shape.absarc(0,cy,r,0,-Math.PI,true);shape.lineTo(-r,29);shape.lineTo(-half,29);shape.closePath();
      const geom=new THREE.ExtrudeGeometry(shape,{depth:p.nose??5,bevelEnabled:false,curveSegments:24});geom.rotateY(Math.PI/2);geom.translate(-(p.nose??5),0,0);
      g.add(new THREE.Mesh(geom,this.material(colors.pla)));
    }else if(p.shape==='rail-mount'){
      const [x,,z]=p.mountTarget!,side=p.mountSide??1;
      mesh=new THREE.Mesh(this.drilledPlate(40,48,12,[{x:0,y:-4,r:(p.bore??6.5)/2},{x:0,y:14,r:(p.bore??6.5)/2}]),this.material(colors.pla));mesh.position.y=18;g.add(mesh);
      // Short horizontal ledge, then fore/aft reach, all at one height.
      block([Math.abs(x)+40,12,40],[x/2,0,side*14]);
      block([40,12,Math.abs(z-side*14)+40],[x,0,(z+side*14)/2]);
    }else if(p.shape==='clamp'){
      const axis=p.axis??'y';
      mesh=new THREE.Mesh(this.drilledPlate(40,axis==='x'?32:40,axis==='x'?40:32,[{x:0,y:0,r:(p.bore??6)/2}],axis),this.material(colors.pla));g.add(mesh);
    }else if(p.shape==='dial-lug'){
      mesh=new THREE.Mesh(this.drilledPlate(p.size[2],18,p.size[0],[{x:0,y:0,r:(p.bore??6.5)/2}],'x'),this.material(colors.gauge));g.add(mesh);
    }else if(p.shape==='clevis'){
      const gap=p.lugWidth??6.6,z=19-(p.lugOffset??8);
      mesh=block([40,8,60],[0,-16,0]);
      for(const sign of [-1,1]){
        const ear=new THREE.Mesh(this.drilledPlate(18,24,6,[{x:0,y:0,r:2.75}],'x'),this.material(colors.pla));ear.position.set(sign*(gap/2+3),0,z);g.add(ear);
        block([6,8,Math.abs(z+10)+18],[sign*(gap/2+3),-12,(z-10)/2]);
      }
    }else if(p.sku==='foot-pad'){
      mesh=block([3,20,20],[-1.5,0,0]);
      const socket=new THREE.Mesh(this.drilledPlate(20,20,3,[{x:0,y:0,r:3.15}],'x'),this.material(colors.pla));socket.position.x=1.5;g.add(socket);
    }else if(p.shape==='fixed-stop'){
      mesh=block([p.size[0],30,30],[0,0,0]);
      const flange=new THREE.Mesh(this.drilledPlate(30,56,8,[{x:0,y:-22,r:4.5},{x:0,y:22,r:4.5}],'x'),this.material(colors.pla));flange.position.x=p.size[0]/2-4;g.add(flange);
    }else if(p.shape==='contact-cap'){
      mesh=block([6,8,p.size[2]],[-p.size[0]/2+3,0,0]);
      for(const sign of [-1,1])block([p.size[0],p.size[1],3],[0,0,sign*(p.size[2]/2-1.5)]);
      if(p.endLocated){const P=p.profileSize!,sign=p.angleSign??1,standOff=p.size[0]-P/Math.sqrt(2);const seat=block([P,3,P],[standOff/2-1.5/Math.sqrt(2),sign*1.5/Math.sqrt(2),0]);seat.rotation.z=sign>0?Math.PI/4:3*Math.PI/4;}
    }else if(p.shape==='photo-bracket'){
      const sign=p.angleSign??1;
      mesh=new THREE.Mesh(this.drilledPlate(18,60,6,[{x:0,y:-sign*10,r:2.75}],'x'),this.material(0x555d67));mesh.position.set(-3,-sign*30,0);g.add(mesh);
      const leg=new THREE.Mesh(this.drilledPlate(18,60,6,[{x:0,y:sign*10,r:2.75}],'x'),this.material(0x555d67));leg.rotation.z=sign*Math.PI/4;leg.position.set(-30/Math.sqrt(2),sign*30/Math.sqrt(2),0);g.add(leg);
    }else if(p.shape==='angle-foot'){
      const reach=p.angleReach!,sign=p.angleSign!;
      const shape=new THREE.Shape();shape.moveTo(24,-12);shape.lineTo(24,12);shape.lineTo(-reach,sign*reach+12);shape.lineTo(-reach,sign*reach-12);shape.closePath();
      for(const y of [-7,7]){const hole=new THREE.Path();hole.absarc(0,y,2.75,0,Math.PI*2,true);shape.holes.push(hole);}
      const geom=new THREE.ExtrudeGeometry(shape,{depth:12,bevelEnabled:false});geom.translate(0,0,-6);
      mesh=new THREE.Mesh(geom,this.material(colors.pla));g.add(mesh);
    }else if(p.shape==='dish-plate'){
      mesh=new THREE.Mesh(this.drilledPlate(p.size[2],p.size[1],p.size[0],p.holes??[],'x'),this.material(colors.pla));g.add(mesh);
    }else if(p.shape==='fork'){
      const w=p.size[2]/2,h=p.size[1]/2,r=(p.bore??12)/2;
      const shape=new THREE.Shape();shape.moveTo(-w,-h);shape.lineTo(w,-h);shape.lineTo(w,h);shape.lineTo(r,h);shape.lineTo(r,0);shape.absarc(0,0,r,0,-Math.PI,true);shape.lineTo(-r,h);shape.lineTo(-w,h);shape.closePath();
      const front=new THREE.ExtrudeGeometry(shape,{depth:3,bevelEnabled:false,curveSegments:24});front.translate(0,0,-p.size[0]/2);front.rotateY(Math.PI/2);g.add(new THREE.Mesh(front,this.material(colors.pla)));
      for(const hole of p.holes??[]){const path=new THREE.Path();path.absarc(hole.x,hole.y,hole.r,0,Math.PI*2,true);shape.holes.push(path);}
      const geom=new THREE.ExtrudeGeometry(shape,{depth:5,bevelEnabled:false,curveSegments:24});geom.translate(0,0,-p.size[0]/2+3);geom.rotateY(Math.PI/2);
      mesh=new THREE.Mesh(geom,this.material(colors.pla));g.add(mesh);
    }else if(p.shape==='dial'){
      mesh=this.cylinder(27.5,22,colors.gauge,'z');g.add(mesh);
      const face=this.dialFace();face.position.z=11.2;g.add(face);
    }else
    if(p.kind==='extrusion'){
      // Four continuous groove faces communicate T-slot construction, without
      // pretending the generic cross-section is a supplier machining drawing.
      mesh=this.box(p.size,colors.extrusion);g.add(mesh);
      const axis=p.axis??'y', ai={x:0,y:1,z:2}[axis];
      const cross=[0,1,2].filter(i=>i!==ai);const width=p.size[cross[0]];
      for(const face of cross)for(const sign of [-1,1]){
        const dims=[width*.19,width*.19,width*.19];dims[ai]=p.size[ai]+.2;dims[face]=.5;
        const groove=this.box(dims,0x24303e);groove.position.setComponent(face,sign*(width/2+.2));g.add(groove);
      }
    }else if(p.shape==='ring'){
      const section=new THREE.Shape();section.absarc(0,0,Math.min(p.size[1],p.size[2])/2,0,Math.PI*2,false);
      const bore=new THREE.Path();bore.absarc(0,0,(p.bore??10)/2,0,Math.PI*2,true);section.holes.push(bore);
      const geometry=new THREE.ExtrudeGeometry(section,{depth:p.size[0],bevelEnabled:false,curveSegments:32});geometry.translate(0,0,-p.size[0]/2);geometry.rotateY(Math.PI/2);
      mesh=new THREE.Mesh(geometry,this.material(colors[p.kind]));g.add(mesh);
    }else if(p.shape==='cylinder'){mesh=this.cylinder(p.size[0]/2,p.size[1],colors[p.kind],p.axis,p.name.toLowerCase().includes('nut')?6:20);g.add(mesh);}
    else {mesh=this.box(p.size,colors[p.kind]);g.add(mesh);}
    const edge=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:0x101b27,transparent:true,opacity:.35}));
    edge.rotation.copy(mesh.rotation);edge.position.copy(mesh.position);g.add(edge);
    if(p.rotation)g.rotation.fromArray(p.rotation);
    g.position.fromArray(p.position);return g;
  }
  update(a:Assembly,refit=false){
    this.clear(this.group);this.clear(this.wheel);this.clear(this.labels);this.meshes.clear();this.parts=a.parts;
    for(const p of a.parts){const g=this.part(p);this.meshes.set(p.id,g);this.group.add(g);}
    const w=a.wheel, R=w.diameter/2;
    // Annular rim: the real rim section is represented by its outside envelope.
    const shape=new THREE.Shape();shape.absarc(0,0,R,0,Math.PI*2,false);
    const hole=new THREE.Path();hole.absarc(0,0,R-w.depth,0,Math.PI*2,true);shape.holes.push(hole);
    const rimGeom=new THREE.ExtrudeGeometry(shape,{depth:w.width,bevelEnabled:false,curveSegments:96});rimGeom.translate(0,0,-w.width/2);rimGeom.rotateY(Math.PI/2);
    const rim=new THREE.Mesh(rimGeom,this.material(0x586778));rim.position.x=w.offset;this.wheel.add(rim);
    this.wheel.add(this.cylinder(16,w.hubWidth,0x34455c,'x'));
    for(const side of [-1,1]){
      const fx=side<0?-w.left:w.right,fr=(side<0?w.flangeL:w.flangeR)/2;
      const flange=this.cylinder(fr,4,0x8393a6,'x');flange.position.x=fx;this.wheel.add(flange);
      for(let i=0;i<w.spokes/2;i++){
        const t=i/(w.spokes/2)*Math.PI*2+(side>0?.1:0);
        const start=new THREE.Vector3(fx,Math.cos(t)*fr,Math.sin(t)*fr);
        const end=new THREE.Vector3(w.offset,Math.cos(t+.35)*(R-w.depth),Math.sin(t+.35)*(R-w.depth));
        const diff=end.clone().sub(start), spoke=this.cylinder(.8,diff.length(),0x93a4b7);
        spoke.position.copy(start.add(end).multiplyScalar(.5));spoke.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),diff.normalize());this.wheel.add(spoke);
      }
    }
    this.wheelOrigin.fromArray(w.center);this.wheel.position.copy(this.wheelOrigin);
    const bounds=new THREE.Box3().setFromObject(this.group).union(new THREE.Box3().setFromObject(this.wheel));
    bounds.getCenter(this.center);this.span=Math.max(...bounds.getSize(new THREE.Vector3()).toArray(),600);
    for(const p of a.parts.filter(p=>p.kind==='extrusion')){
      const label=this.label(`${p.stock} mm`,p.position);label.position.x+=p.size[0]/2+30;this.labels.add(label);
    }
    this.applyWheelPose();this.setExplode(this.explode);this.select(this.selected);if(refit)this.view('iso');
  }
  private label(text:string,position:number[]){
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#0b111ae8';ctx.fillRect(0,0,256,64);ctx.strokeStyle='#3d6678';ctx.strokeRect(1,1,254,62);ctx.fillStyle='#b9f5ef';ctx.font='26px monospace';ctx.textAlign='center';ctx.fillText(text,128,42);
    const texture=new THREE.CanvasTexture(canvas);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));sprite.position.fromArray(position);sprite.scale.set(120,30,1);return sprite;
  }
  select(ids:string[]){this.selected=ids;for(const[id,g]of this.meshes)g.traverse(o=>{if(o instanceof THREE.Mesh&&o.material instanceof THREE.MeshStandardMaterial){o.material.emissive.setHex(ids.includes(id)?0xa86216:0);o.material.emissiveIntensity=.7;}});}
  setExplode(value:number){
    this.explode=value;
    for(const p of this.parts){
      const g=this.meshes.get(p.id)!;
      g.position.fromArray(p.position);
      g.position.x+=Math.sign(p.position[0]||1)*value*p.stage*35;
      g.position.y+=value*(p.stage-1)*75;
      g.position.z+=Math.sign(p.position[2]||1)*value*(p.stage-1)*35;
      // Reveal the socket by sliding it upward off its rail-end datum.
      if(p.capDesign==='centred-v2')g.position.y+=value*(40-hubCapExport.meshes.cap.min[1]);
    }
    this.labels.visible=value===0&&this.dimensions;
    this.applyWheelPose();
  }
  private dimensions=true;
  showDimensions(value:boolean){this.dimensions=value;this.labels.visible=value&&this.explode===0;}
  showWheel(value:boolean){this.wheel.visible=value;for(const p of this.parts)if(p.movesWithWheel)this.meshes.get(p.id)!.visible=value;}
  setWheelPose(lifted:boolean,reversed:boolean){this.wheelLift=lifted?130:0;this.reversed=reversed;this.applyWheelPose();}
  private applyWheelPose(){
    this.wheel.position.copy(this.wheelOrigin);this.wheel.position.y+=this.wheelLift;this.wheel.rotation.y=this.reversed?Math.PI:0;
    for(const p of this.parts)if(p.movesWithWheel){const g=this.meshes.get(p.id)!;g.position.fromArray(p.position);g.position.y+=this.wheelLift;if(this.reversed){g.position.x=-g.position.x;g.position.z=-g.position.z;}g.rotation.y=this.reversed?Math.PI:0;}
  }
  focusParts(ids:string[]){
    const bounds=new THREE.Box3();for(const id of ids){const obj=this.meshes.get(id);if(obj)bounds.union(new THREE.Box3().setFromObject(obj));}
    if(bounds.isEmpty())return;
    const target=bounds.getCenter(new THREE.Vector3()), span=Math.max(...bounds.getSize(new THREE.Vector3()).toArray(),100);
    this.inspection={target:target.clone(),distance:span*2};
    this.controls.target.copy(target);this.camera.position.copy(target).add(new THREE.Vector3(1.3,.8,1.7).normalize().multiplyScalar(span*2));this.controls.update();
  }
  view(view:string){
    const directions:Record<string,number[]>={iso:[1.5,.9,1.4],side:[2,0,0],front:[0,0,2],top:[0,2,.001],bottom:[0,-2,.001]};
    if(view==='iso')this.inspection=undefined;
    const target=this.inspection?.target??this.center;
    const d=new THREE.Vector3().fromArray(directions[view]??directions.iso).normalize().multiplyScalar(this.inspection?.distance??this.span*1.85);
    this.controls.target.copy(target);this.camera.position.copy(target).add(d);this.controls.update();
  }
  private animate=()=>{this.frame=requestAnimationFrame(this.animate);this.controls.update();this.renderer.render(this.scene,this.camera);};
  dispose(){cancelAnimationFrame(this.frame);this.resize.disconnect();this.controls.dispose();this.renderer.domElement.removeEventListener('pointerdown',this.pointerDown);this.renderer.domElement.removeEventListener('pointerup',this.pointerUp);this.renderer.domElement.removeEventListener('webglcontextlost',this.contextLost);this.clear(this.group);this.clear(this.wheel);this.clear(this.labels);this.renderer.dispose();this.renderer.domElement.remove();}
}
