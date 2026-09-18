import type { WheelBuildInputs } from './physicsCalculator';

export type Point3 = { x: number; y: number; z: number };
export interface SpokePath {
  side: 'Left' | 'Right'; index: number; headsOut: boolean;
  hole: Point3; start: Point3; end: Point3;
  points: Point3[]; flangeContacts: Point3[]; crossingContact?: Point3;
  chordLength: number; pathLength: number; bendAllowance: number;
  traditionalLength: number; estimatedLength: number;
  valid: boolean; error?: string;
}
export interface SpokePaths { spokes: SpokePath[]; errors: string[] }
const add = (a: Point3, b: Point3): Point3 => ({ x: a.x+b.x, y: a.y+b.y, z: a.z+b.z });
const sub = (a: Point3, b: Point3): Point3 => ({ x: a.x-b.x, y: a.y-b.y, z: a.z-b.z });
const mul = (a: Point3, s: number): Point3 => ({ x: a.x*s, y: a.y*s, z: a.z*s });
const dot = (a: Point3, b: Point3) => a.x*b.x+a.y*b.y+a.z*b.z;
const cross = (a: Point3, b: Point3): Point3 => ({ x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x });
const norm = (a: Point3) => Math.hypot(a.x,a.y,a.z);
const unit = (a: Point3) => mul(a,1/norm(a));
export const distance = (a: Point3,b: Point3) => norm(sub(a,b));
export const polylineLength = (p: Point3[]) => p.slice(1).reduce((s,b,i)=>s+distance(p[i],b),0);

/** Minimum distance between finite segments (including parallel and endpoint cases). */
export function segmentDistance(p: Point3,q: Point3,r: Point3,s: Point3): number {
  const u=sub(q,p),v=sub(s,r),w=sub(p,r),a=dot(u,u),b=dot(u,v),c=dot(v,v),d=dot(u,w),e=dot(v,w);
  const clamp=(x:number)=>Math.max(0,Math.min(1,x));
  if(a<1e-15) return distance(p,add(r,mul(v,c?clamp(e/c):0)));
  if(c<1e-15) return distance(r,add(p,mul(u,clamp(-d/a))));
  const den=a*c-b*b;
  let t=den>1e-12?clamp((b*e-c*d)/den):0;
  let h=(b*t+e)/c;
  if(h<0){h=0;t=clamp(-d/a);} else if(h>1){h=1;t=clamp((b-d)/a);}
  return distance(add(p,mul(u,t)),add(r,mul(v,h)));
}
function clearance(a: Point3[],b: Point3[]) {
  let best=Infinity;
  for(let i=1;i<a.length;i++) for(let j=1;j<b.length;j++) best=Math.min(best,segmentDistance(a[i-1],a[i],b[j-1],b[j]));
  return best;
}

type Route = {points:Point3[]; contacts:Point3[]; length:number};
/**
 * Taut shaft around a sharp flange edge, offset by the wire radius.
 * The local section is the plane containing the shaft's projected pull direction
 * and the axle. This local section approximation is not an elastic solver.
 * The rounded contact section is the intersection with the flange expanded by
 * the wire radius. Arc integration uses a fixed fine tolerance, independently
 * of the sampling used for drawing and contact checks. The manufactured elbow is excluded.
 */
function route(start:Point3,end:Point3,side:number,zFlange:number,outer:number,thickness:number,radius:number,arcStep:number):Route {
  const delta=sub(end,start), planar=Math.hypot(delta.x,delta.y);
  if(planar<1e-8) throw new Error('Shaft has no radial span.');
  const u={x:delta.x/planar,y:delta.y/planar,z:0};
  const faceSign = start.z < zFlange ? -1 : 1;
  const endZ=faceSign*(end.z-zFlange);
  // A shaft moving away from its departure face needs no flange contact.
  // Heads-out can also need contact for a close interlaced crossing.
  if(endZ >= thickness/2+radius-1e-10) return {points:[start,end],contacts:[],length:distance(start,end)};
  const proj=start.x*u.x+start.y*u.y;
  const radicand=proj*proj+outer*outer-start.x*start.x-start.y*start.y;
  if(radicand<=0) throw new Error('Elbow exit is outside the flange.');
  const edge=-proj+Math.sqrt(radicand),top=thickness/2;
  if(planar<=edge+radius) throw new Error('No clear route around flange edge.');
  const point=(x:number,z:number)=>({x:start.x+u.x*x,y:start.y+u.y*x,z:zFlange+faceSign*z});
  // Exact section of the cylinder's radius-expanded edge (not a circular arc
  // in an oblique section). This keeps physical clearance even at high crosses.
  const radial2=start.x*start.x+start.y*start.y;
  const section=(angle:number)=>{
    const rho=outer+radius*Math.cos(angle);
    const root=Math.sqrt(proj*proj+rho*rho-radial2);
    return {x:-proj+root,z:top+radius*Math.sin(angle),dx:-rho*radius*Math.sin(angle)/root,dz:radius*Math.cos(angle)};
  };
  const tangent=(angle:number)=>{const p=section(angle);return (planar-p.x)*p.dz-(endZ-p.z)*p.dx;};
  if(tangent(0)<=0||tangent(Math.PI/2)>=0) throw new Error('No tangent flange route.');
  let lo=0,hi=Math.PI/2;
  for(let i=0;i<48;i++){const m=(lo+hi)/2;if(tangent(m)>0)lo=m;else hi=m;}
  const theta=(lo+hi)/2;
  const contact=point(edge,top+radius),q=section(theta),exit=point(q.x,q.z);
  const steps=Math.max(2,Math.ceil((Math.PI/2-theta)/arcStep));
  const points=[start,contact];
  for(let i=1;i<=steps;i++){const p=section(Math.PI/2+(theta-Math.PI/2)*i/steps);points.push(point(p.x,p.z));}
  points.push(end);
  // Simpson integration of section speed; 128 intervals is well below 0.01 mm
  // for supported dimensions. Integration is independent of display sampling.
  const intervals=128,h=(Math.PI/2-theta)/intervals;
  let sum=0;
  for(let i=0;i<=intervals;i++){const p=section(theta+i*h);sum+=(i===0||i===intervals?1:i%2?4:2)*Math.hypot(p.dx,p.dz);}
  return {points,contacts:[contact,exit],length:distance(start,contact)+sum*h/3+distance(exit,end)};
}

export function calculateSpokePaths(inputs:WheelBuildInputs, arcStep=0.01):SpokePaths {
  const spokes:SpokePath[]=[], errors:string[]=[];
  const {erd,spokeCount,spokeHoleDiameter,hubOffset,osb}=inputs;
  const diameter=inputs.spokeDiameter ?? 2, r=diameter/2;
  const common=[erd,spokeCount,spokeHoleDiameter,hubOffset,osb,diameter,inputs.drillingOffsetLeft,inputs.drillingOffsetRight];
  if(!common.every(Number.isFinite)||erd<=0||diameter<=0||spokeHoleDiameter<diameter||!Number.isInteger(spokeCount)||spokeCount<8||spokeCount>64||spokeCount%4!==0||!Number.isFinite(arcStep)||arcStep<=0) return {spokes,errors:['Invalid wheel geometry or spoke diameter exceeds the hub hole.']};
  const shift=inputs.rimFlip==='Left'?osb:inputs.rimFlip==='Right'?-osb:inputs.centerToLeft-hubOffset>inputs.centerToRight+hubOffset?osb:-osb;
  for(const sideName of ['Left','Right'] as const) {
    const left=sideName==='Left',sign=left?-1:1;
    const pcd=left?inputs.flangePcdLeft:inputs.flangePcdRight;
    const width=left?inputs.centerToLeft:inputs.centerToRight;
    const outer=(left?inputs.flangeOuterDiameterLeft:inputs.flangeOuterDiameterRight);
    const thick=(left?inputs.flangeThicknessLeft:inputs.flangeThicknessRight) ?? inputs.flangeThickness;
    const crosses=left?inputs.crossesLeft:inputs.crossesRight;
    const zFlange=sign*width+hubOffset;
    const rimZ=-shift+sign*(left?inputs.drillingOffsetLeft:inputs.drillingOffsetRight);
    const w=sign*(zFlange-rimZ);
    if(outer===undefined||thick===undefined||![pcd,width,outer,thick,crosses,w].every(Number.isFinite)||pcd<=0||outer<pcd+spokeHoleDiameter||thick<=0||w<=thick/2+r||erd<=outer+diameter||!Number.isInteger(crosses)||crosses<0||crosses>spokeCount/8) {errors.push(`${sideName}: enter valid flange outside diameter, thickness and crossing count.`);continue;}
    const count=spokeCount/2, group:SpokePath[]=[];
    const apply=(sp:SpokePath,contact?:Point3) => {
      const first=route(sp.start,contact??sp.end,sign,zFlange,outer/2,thick,r,arcStep);
      sp.points=contact?[...first.points,sp.end]:first.points;
      sp.flangeContacts=first.contacts;sp.crossingContact=contact;
      sp.pathLength=first.length+(contact?distance(contact,sp.end):0);
      sp.bendAllowance=sp.pathLength-sp.chordLength;
      if(!Number.isFinite(sp.pathLength)||sp.bendAllowance< -1e-7) throw new Error('Invalid path length.');
      sp.bendAllowance=Math.max(0,sp.bendAllowance);
      sp.estimatedLength=sp.traditionalLength+sp.bendAllowance;
    };
    for(let j=0;j<count;j++) {
      const headsOut=j%2===0, a=j*2*Math.PI/count+(left?0:Math.PI/count),b=a+(headsOut?1:-1)*crosses*2*Math.PI/count;
      const hole={x:pcd/2*Math.cos(a),y:pcd/2*Math.sin(a),z:zFlange};
      const end={x:erd/2*Math.cos(b),y:erd/2*Math.sin(b),z:rimZ};
      const pull=unit({x:end.x-hole.x,y:end.y-hole.y,z:0});
      const start=add(hole,mul(pull,(spokeHoleDiameter-diameter)/2));
      start.z+=sign*(headsOut?-1:1)*(thick/2+r);
      const traditionalLength=distance(hole,end)-spokeHoleDiameter/2;
      const sp:SpokePath={side:sideName,index:j,headsOut,hole,start,end,points:[],flangeContacts:[],chordLength:distance(start,end),pathLength:NaN,bendAllowance:NaN,traditionalLength,estimatedLength:NaN,valid:true};
      try{apply(sp);}catch(e){sp.valid=false;sp.error=String(e);}
      group.push(sp);
    }
    if(inputs.interlaced===true && crosses>0) {
      // Find the final projected crossing for each spoke, then require mutual pairs.
      const pairs=new Map<number,{other:number,t:number,u:number,point:Point3}>();
      for(let a=0;a<count;a+=2) for(let b=1;b<count;b+=2) {
        const A=group[a],B=group[b],d=sub(A.end,A.start),e=sub(B.end,B.start),v=sub(B.start,A.start);
        const den=d.x*e.y-d.y*e.x;
        if(Math.abs(den)<1e-8) continue;
        const t=(v.x*e.y-v.y*e.x)/den,u=(v.x*d.y-v.y*d.x)/den;
        if(t<=0||t>=1||u<=0||u>=1) continue;
        const point=add(A.start,mul(d,t));
        if(t>(pairs.get(a)?.t??0)) pairs.set(a,{other:b,t,u,point});
        if(u>(pairs.get(b)?.t??0)) pairs.set(b,{other:a,t:u,u:t,point});
      }
      for(let a=0;a<count;a+=2) {
        const pair=pairs.get(a);if(!pair) continue;
        const A=group[a],B=group[pair.other];
        try {
          if(!A.valid||!B.valid||pairs.get(pair.other)?.other!==a) throw new Error('No mutual final crossing.');
          const lastSpan=(sp:SpokePath)=>[sp.points[sp.points.length-2],sp.end];
          const [a0,a1]=lastSpan(A),[b0,b1]=lastSpan(B);
          const zAt=(p:Point3,q:Point3)=>{const d=sub(q,p),v=sub(pair.point,p);return p.z+d.z*(v.x*d.x+v.y*d.y)/(d.x*d.x+d.y*d.y);};
          const mid={...pair.point,z:(zAt(a0,a1)+zAt(b0,b1))/2};
          let normal=unit(cross(sub(a1,a0),sub(b1,b0)));
          if(normal.z*sign<0)normal=mul(normal,-1);
          const fit=(offset:number)=>{apply(A,add(mid,mul(normal,offset)));apply(B,add(mid,mul(normal,-offset)));return clearance(A.points,B.points);};
          let lo=r,hi=diameter*4;
          if(fit(hi)<diameter-1e-6) throw new Error('Crossing clearance did not converge.');
          for(let iteration=0;iteration<28;iteration++){const m=(lo+hi)/2;if(fit(m)<diameter)lo=m;else hi=m;}
          fit(hi);
        } catch(e){A.valid=B.valid=false;A.error=B.error=String(e);}
      }
    }
    for (const sp of group.filter(p=>p.valid)) {
      for (let k=1;k<sp.points.length;k++) for(let n=0;n<=32;n++) {
        const p=add(sp.points[k-1],mul(sub(sp.points[k],sp.points[k-1]),n/32));
        const radial=Math.max(0,Math.hypot(p.x,p.y)-outer/2);
        const axial=Math.max(0,Math.abs(p.z-zFlange)-thick/2);
        if(Math.hypot(radial,axial)<r-1e-4) {sp.valid=false;sp.error='Shaft intersects the flange.';}
      }
    }
    for(const sp of group) if(!sp.valid) {sp.points=[];sp.pathLength=sp.bendAllowance=sp.estimatedLength=NaN;errors.push(`${sideName} spoke ${sp.index+1}: ${sp.error}`);}
    spokes.push(...group);
  }
  // Reject routes that collide with any other shaft, including earlier crossings
  // and spokes on the opposite side; checking only the interlaced pair is insufficient.
  for(let a=0;a<spokes.length;a++) for(let b=a+1;b<spokes.length;b++) {
    const A=spokes[a],B=spokes[b];
    if(A.valid&&B.valid&&clearance(A.points,B.points)<diameter-1e-4) {
      A.valid=B.valid=false;
      A.error=B.error='Shaft contact constraints could not be satisfied.';
    }
  }
  for(const sp of spokes) if(!sp.valid) {
    sp.points=[];sp.pathLength=sp.bendAllowance=sp.estimatedLength=NaN;
    errors.push(`${sp.side} spoke ${sp.index+1}: ${sp.error}`);
  }
  return {spokes,errors:[...new Set(errors)]};
}
