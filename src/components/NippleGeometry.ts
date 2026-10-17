import * as THREE from 'three';
import { nippleProfileError, nippleReferences, nippleProfileConstants as profile, type NippleFitSettings } from '../utils/nippleFit.ts';

/** Local +Y points from the spoke opening towards the slotted head. Dimensions in mm.
 * Exterior profile uses editable dimensions. Bore, wrench width, slot width and
 * groove spacing remain illustrative, not a manufacturing drawing. */
export function createNippleGeometry(settings: NippleFitSettings, cutaway = false, detailed = false) {
  const group = new THREE.Group();
  if (nippleProfileError(settings)) return group;
  const {opening, headTop: length, taperStart, internalStart, internalEnd: threadEnd} = nippleReferences(settings);
  const slotWidth = profile.slotHalfWidth;
  const bodyRadius = settings.nippleBodyDiameter! / 2, headRadius = settings.nippleHeadDiameter! / 2;
  const wrenchLength = settings.nippleWrenchLength!, barrelLength = settings.nippleBarrelLength!;
  const metal = new THREE.MeshStandardMaterial({color:0xc7cbd0, metalness:.65, roughness:.34, side:THREE.DoubleSide});
  const section = new THREE.MeshStandardMaterial({color:0xd2a65a, metalness:.25, roughness:.6, side:THREE.DoubleSide});
  // A polygon with a bore, square wrench flats and wider head. Extruding half
  // annuli yields real section faces without stencil/clipping artefacts.
  function ring(y: number, height: number, outer: number, square = false, inner: number = profile.boreRadius, slot = false, outerTop = outer) {
    const shape = new THREE.Shape();
    if (cutaway) {
      shape.moveTo(-outer,0);
      if (square) {
        // Wrench flats cut into the round body; corners cannot exceed its diameter.
        for (let i=0;i<=64;i++) {
          const angle=Math.PI*(1-i/64);
          const radius=Math.min(bodyRadius,outer/Math.max(Math.abs(Math.cos(angle)),Math.abs(Math.sin(angle))));
          shape.lineTo(radius*Math.cos(angle),radius*Math.sin(angle));
        }
      } else shape.absarc(0,0,outer,Math.PI,0,true);
      shape.lineTo(inner,0); shape.absarc(0,0,inner,0,Math.PI,false); shape.closePath();
    } else {
      if (square) {
        shape.moveTo(outer,0);
        for (let i=0;i<=128;i++) {
          const angle=2*Math.PI*i/128;
          const radius=Math.min(bodyRadius,outer/Math.max(Math.abs(Math.cos(angle)),Math.abs(Math.sin(angle))));
          shape.lineTo(radius*Math.cos(angle),radius*Math.sin(angle));
        }
        shape.closePath();
      }
      else shape.absarc(0,0,outer,0,Math.PI*2,false);
      const hole = new THREE.Path(); hole.absarc(0,0,inner,0,Math.PI*2,true); shape.holes.push(hole);
    }
    // Slot removes a strip across the head by building the two surviving lobes.
    if (slot) {
      for (const sign of [-1,1]) {
        if (cutaway && sign < 0) continue;
        const lobe = new THREE.Shape();
        const a = Math.asin(slotWidth/outer);
        if (sign > 0) { lobe.absarc(0,0,outer,a,Math.PI-a,false); lobe.lineTo(-Math.sqrt(inner*inner-slotWidth*slotWidth),slotWidth); lobe.absarc(0,0,inner,Math.PI-Math.asin(slotWidth/inner),Math.asin(slotWidth/inner),true); }
        else { lobe.absarc(0,0,outer,Math.PI+a,2*Math.PI-a,false); lobe.lineTo(Math.sqrt(inner*inner-slotWidth*slotWidth),-slotWidth); lobe.absarc(0,0,inner,2*Math.PI-Math.asin(slotWidth/inner),Math.PI+Math.asin(slotWidth/inner),true); }
        lobe.closePath(); add(lobe,y,height,outer,outerTop,true);
      }
    } else add(shape,y,height,outer,outerTop);
  }
  function add(shape: THREE.Shape, y: number, height: number, outer: number, outerTop: number, slot = false) {
    const geometry = new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,curveSegments:24});
    if (outerTop !== outer) {
      // Loft only the outer contour. The bore stays cylindrical and the slot
      // stays the same width through the measured conical head.
      const positions=geometry.attributes.position;
      for (let i=0;i<positions.count;i++) {
        const x=positions.getX(i), z=positions.getY(i), radius=Math.hypot(x,z);
        if (Math.abs(radius-outer)>1e-5) continue;
        const targetRadius=outer+(outerTop-outer)*positions.getZ(i)/height;
        if (slot && Math.abs(Math.abs(z)-slotWidth)<1e-5) {
          positions.setXY(i,Math.sign(x)*Math.sqrt(targetRadius*targetRadius-z*z),z);
        } else positions.setXY(i,x*targetRadius/radius,z*targetRadius/radius);
      }
      geometry.computeVertexNormals();
    }
    geometry.rotateX(-Math.PI/2); geometry.translate(0,y,0);
    const mesh = new THREE.Mesh(geometry,[metal,cutaway?section:metal]); group.add(mesh);
  }
  ring(opening,wrenchLength,Math.min(profile.wrenchHalfWidth,bodyRadius*.9),true);
  ring(wrenchLength,barrelLength,bodyRadius);
  // Any unassigned length remains an explicit cylindrical allowance, rather
  // than stretching the user-entered section lengths.
  const allowance=taperStart-wrenchLength-barrelLength;
  if (allowance>1e-8) ring(wrenchLength+barrelLength,allowance,bodyRadius);
  const slotFloorRadius=bodyRadius+(headRadius-bodyRadius)*(threadEnd-taperStart)/(length-taperStart);
  ring(taperStart,threadEnd-taperStart,bodyRadius,false,profile.boreRadius,false,slotFloorRadius);
  ring(threadEnd,length-threadEnd,slotFloorRadius,false,profile.boreRadius,true,headRadius);
  // Deliberately schematic internal thread rings; no exact pitch is claimed.
  for (let y=detailed ? internalStart+profile.internalMarkerOffset : Infinity;y<threadEnd;y+=profile.threadMarkerSpacing)
    ring(y,Math.min(profile.internalMarkerHeight,threadEnd-y),profile.internalMarkerOuterRadius,false,profile.internalMarkerInnerRadius);
  group.userData.references = nippleReferences(settings);
  group.name = 'nipple';
  return group;
}
