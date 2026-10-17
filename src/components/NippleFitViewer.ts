import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createNippleGeometry } from './NippleGeometry.ts';
import { nippleProfileConstants as profile, type NippleFit, type NippleFitSettings } from '../utils/nippleFit.ts';

/** Independent close-up: real millimetres, unaffected by wheel display scaling. */
export class NippleFitViewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35,1,.05,5000);
  private controls: OrbitControls;
  private content = new THREE.Group();
  private observer: ResizeObserver;
  private frame = 0;
  private extent: [number,number] = [-5,15];
  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({antialias:true,alpha:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'pan-y';
    this.controls = new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 2000;
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x536479,3));
    const light = new THREE.DirectionalLight(0xffffff,4);light.position.set(8,15,20);this.scene.add(light);
    this.scene.add(this.content);
    this.observer = new ResizeObserver(()=>this.resize());this.observer.observe(container);
    this.resize();this.resetView();
    const render = () => {this.frame=requestAnimationFrame(render); if (!this.container.getClientRects().length || !this.container.clientWidth) return; this.controls.update();this.renderer.render(this.scene,this.camera);};
    render();
  }
  private resize() { const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix(); }
  resetView() {
    const mid=(this.extent[0]+this.extent[1])/2;
    const height=Math.max(20,this.extent[1]-this.extent[0]+4);
    const distance=Math.max(height,18/Math.max(.4,this.camera.aspect))/(2*Math.tan(THREE.MathUtils.degToRad(17.5)));
    this.controls.target.set(0,mid,0);this.camera.position.set(0,mid,distance);this.controls.update();
  }
  private clear() {
    this.content.traverse(o=>{if(o instanceof THREE.Mesh) {
      if ('geometry' in o) o.geometry.dispose();
      for(const material of Array.isArray(o.material)?o.material:[o.material]) {if('map' in material && material.map instanceof THREE.Texture)material.map.dispose();material.dispose();}
    }});this.content.clear();
  }
  update(fit: NippleFit, s: NippleFitSettings, cutaway: boolean, rimEyelets: boolean) {
    this.clear();if(!fit.valid)return;
    this.content.add(createNippleGeometry(s,cutaway,true));
    const start=Math.min(-5,fit.threadStart-2), end=fit.tip;
    const cylinder = (lo:number,hi:number,radius:number,color:number) => {
      if(hi<=lo)return;
      const shape=new THREE.Shape();
      if(cutaway){shape.moveTo(-radius,0);shape.absarc(0,0,radius,Math.PI,0,true);shape.closePath();}
      else shape.absarc(0,0,radius,0,Math.PI*2,false);
      const geometry=new THREE.ExtrudeGeometry(shape,{depth:hi-lo,bevelEnabled:false,curveSegments:24});
      geometry.rotateX(-Math.PI/2);geometry.translate(0,lo,0);
      this.content.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,metalness:.3,roughness:.5,side:THREE.DoubleSide})));
    };
    cylinder(start,Math.max(start,fit.threadStart),profile.nominalSpokeDiameter/2,0x97a5b5);
    cylinder(Math.max(start,fit.threadStart),end,profile.nominalSpokeDiameter/2,0x49cde5);
    // Thin contrasting bands indicate the threaded interval, not precise pitch.
    for(let y=Math.max(start,fit.threadStart)+profile.spokeMarkerOffset;y<end;y+=profile.threadMarkerSpacing)
      cylinder(y,Math.min(end,y+profile.spokeMarkerHeight),profile.spokeMarkerRadius,0x087e96);
    const plate = new THREE.Shape(), radius=s.nippleBodyDiameter!/2;
    if(cutaway){plate.moveTo(-8,0);plate.lineTo(-radius,0);plate.absarc(0,0,radius,Math.PI,0,true);plate.lineTo(8,0);plate.lineTo(8,3);plate.lineTo(-8,3);plate.closePath();}
    else {plate.moveTo(-8,-3);plate.lineTo(8,-3);plate.lineTo(8,3);plate.lineTo(-8,3);plate.closePath();const hole=new THREE.Path();hole.absarc(0,0,radius,0,2*Math.PI,true);plate.holes.push(hole);}
    // Approximate local support at the taper start, not a measured bearing seat.
    const rim = new THREE.ExtrudeGeometry(plate,{depth:.9,bevelEnabled:false});rim.rotateX(-Math.PI/2);rim.translate(0,fit.references.taperStart-.9,0);
    this.content.add(new THREE.Mesh(rim,new THREE.MeshStandardMaterial({color:0x596b82,roughness:.7,side:THREE.DoubleSide})));
    if(rimEyelets){const eyelet=new THREE.Mesh(new THREE.TorusGeometry(radius+.15,.15,8,32,cutaway?Math.PI:Math.PI*2),new THREE.MeshStandardMaterial({color:0xd7dde4,metalness:.5}));eyelet.rotation.x=-Math.PI/2;eyelet.position.y=fit.references.taperStart;this.content.add(eyelet);}
    this.extent=[start-1,Math.max(fit.references.headTop,fit.tip)+1];
    this.resize();
  }
  dispose(){cancelAnimationFrame(this.frame);this.observer.disconnect();this.clear();this.controls.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}
