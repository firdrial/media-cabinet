import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { FACE_CONFIGS } from './Tape3DViewer';

const CAM_Z = 3.2;
const FOV = 40;
const DURATION = 0.7; // seconds, matches ReelSwap's tumble
const BORDER_PX = 3;  // matches your old guideBox borderWidth
const GUIDE_COLOR = '#00a8ff'; // swap to '#3E7BFA' for exact ReelSwap blue

// Cumulative poses. Yaw runs 0→90→180→270→360 so the front always exits
// stage-right (ReelSwap direction); top/bottom pitch through the front.
const POSES = {
  front:  { rx: 0,              ry: 0 },
  left:   { rx: 0,              ry: Math.PI / 2 },
  back:   { rx: 0,              ry: Math.PI },
  right:  { rx: 0,              ry: (3 * Math.PI) / 2 },
  top:    { rx: Math.PI / 2,    ry: 2 * Math.PI },
  bottom: { rx: -Math.PI / 2,   ry: 2 * Math.PI },
};

const FACE_MAP = {};
FACE_CONFIGS.forEach((c) => { FACE_MAP[c.key] = c; });

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Draws a constant-pixel blue border; interior is either the captured
// texture or fully discarded (transparent) so the camera shows through.
// Backface culling (FrontSide) is what creates the wireframe look:
// only camera-facing panels draw their outlines.
const FRAG = `
uniform sampler2D uMap;
uniform float uHasMap;
uniform vec2 uFacePx;
uniform float uBorderPx;
uniform vec3 uColor;
uniform float uFill;
varying vec2 vUv;
void main() {
  vec2 d = vec2(min(vUv.x, 1.0 - vUv.x) * uFacePx.x,
                min(vUv.y, 1.0 - vUv.y) * uFacePx.y);
  if (min(d.x, d.y) < uBorderPx) { gl_FragColor = vec4(uColor, 1.0); return; }
  if (uHasMap > 0.5) {
    // explicit V-flip: EXGL ignores flipY (same policy as your viewer)
    gl_FragColor = vec4(texture2D(uMap, vec2(vUv.x, 1.0 - vUv.y)).rgb, 1.0);
    return;
  }
  if (uFill > 0.0) { gl_FragColor = vec4(uColor, uFill); return; }
  discard;
}`;

function makeMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: true,
    uniforms: {
      uMap: { value: null },
      uHasMap: { value: 0 },
      uFacePx: { value: new THREE.Vector2(1, 1) },
      uBorderPx: { value: BORDER_PX },
      uColor: { value: new THREE.Color(GUIDE_COLOR) },
      uFill: { value: 0 }, // set ~0.1 if you want your old tint back
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
}

function TextureBinder({ url, material }) {
  const texture = useTexture(url);
  useEffect(() => {
    texture.flipY = false;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    material.uniforms.uMap.value = texture;
    material.uniforms.uHasMap.value = 1;
    return () => {
      material.uniforms.uMap.value = null;
      material.uniforms.uHasMap.value = 0;
    };
  }, [texture, material]);
  return null;
}

function GuideFace({ config, material, url }) {
  return (
    <mesh position={config.position} rotation={config.rotation} material={material}>
      <planeGeometry args={[config.width, config.height]} />
      {url ? (
        <Suspense fallback={null}>
          <TextureBinder url={url} material={material} />
        </Suspense>
      ) : null}
    </mesh>
  );
}

function AnimatedBox({ stepKey, captured, guideWidth, guideHeight }) {
  const group = useRef();
  const propsRef = useRef();
  propsRef.current = { stepKey, guideWidth, guideHeight };

  const curRef = useRef({ rx: POSES[stepKey].rx, ry: POSES[stepKey].ry, s: 0 });
  const animRef = useRef(null);

  const materials = useMemo(() => {
    const m = {};
    FACE_CONFIGS.forEach((c) => { m[c.key] = makeMaterial(); });
    return m;
  }, []);
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);

  useEffect(() => {
    const to = POSES[stepKey];
    animRef.current = {
      fromRx: curRef.current.rx, fromRy: curRef.current.ry, fromS: curRef.current.s,
      toRx: to.rx, toRy: to.ry, start: -1,
    };
  }, [stepKey]);

  useFrame((state, delta) => {
    const proj = state.size.height / (2 * CAM_Z * Math.tan((FOV * Math.PI) / 360));
    const { stepKey: key, guideWidth: gw, guideHeight: gh } = propsRef.current;
    const cfg = FACE_MAP[key];
    const sTarget = Math.min(gw / (cfg.width * proj), gh / (cfg.height * proj));

    const a = animRef.current;
    if (a) {
      if (a.start < 0) {
        a.start = state.clock.elapsedTime;
        if (!a.fromS) a.fromS = sTarget; // first mount: snap, don't grow in
      }
      const t = Math.min(1, (state.clock.elapsedTime - a.start) / DURATION);
      const e = easeInOutCubic(t);
      curRef.current.rx = a.fromRx + (a.toRx - a.fromRx) * e;
      curRef.current.ry = a.fromRy + (a.toRy - a.fromRy) * e;
      curRef.current.s = a.fromS + (sTarget - a.fromS) * e;
      if (t >= 1) animRef.current = null;
    } else if (curRef.current.s) {
      curRef.current.s += (sTarget - curRef.current.s) * Math.min(1, delta * 8);
    }
    if (!curRef.current.s) curRef.current.s = sTarget;

    group.current.rotation.set(curRef.current.rx, curRef.current.ry, 0);
    group.current.scale.setScalar(curRef.current.s);

    // keep the border a constant 3px on screen at any scale
    FACE_CONFIGS.forEach((c) => {
      materials[c.key].uniforms.uFacePx.value.set(
        c.width * curRef.current.s * proj,
        c.height * curRef.current.s * proj
      );
    });
  });

  return (
    <group ref={group}>
      {FACE_CONFIGS.map((cfg) => (
        <GuideFace
          key={cfg.key}
          config={cfg}
          material={materials[cfg.key]}
          url={captured?.[cfg.key]?.isWarped ? captured[cfg.key].uri : null}
        />
      ))}
    </group>
  );
}

export default function GuideBox3D(props) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} collapsable={false}>
      <Canvas
        gl={{ alpha: true, antialias: true }}
        style={{ backgroundColor: 'transparent' }}
        camera={{ position: [0, 0, CAM_Z], fov: FOV }}
        onCreated={({ gl }) => gl.setClearAlpha(0)}
      >
        <AnimatedBox {...props} />
      </Canvas>
    </View>
  );
}