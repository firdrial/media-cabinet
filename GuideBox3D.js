import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFaceConfigs, getModel, DEFAULT_MODEL_ID } from './mediaModels';
import { getTheme, DEFAULT_THEME_ID } from './theme';

const DURATION = 1.2;
const BORDER_PX = 3;
const DEFAULT_GUIDE_COLOR = '#00a8ff';

const POSES = {
  front:  { rx: 0,              ry: 0 },
  left:   { rx: 0,              ry: Math.PI / 2 },
  back:   { rx: 0,              ry: Math.PI },
  right:  { rx: 0,              ry: (3 * Math.PI) / 2 },
  top:    { rx: Math.PI / 2,    ry: 2 * Math.PI },
  bottom: { rx: -Math.PI / 2,   ry: 2 * Math.PI },
};

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = `
uniform sampler2D uMap;
uniform float uHasMap;
uniform vec2 uFacePx;
uniform float uBorderPx;
uniform vec3 uColor;
uniform float uFill;
uniform float uRadiusPx;
varying vec2 vUv;

void main() {
  vec2 p = vUv * uFacePx;
  vec2 b = uFacePx / 2.0;
  float r = uRadiusPx;
  
  // Signed Distance Field (SDF) for a rounded rectangle
  vec2 d = abs(p - b) - b + r;
  float sdf = min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;

  // Discard fragments outside the rounded corners
  if (sdf > 0.0) {
    discard;
  }

  // Distance to the inner edge (sdf is negative inside the shape)
  float edgeDist = -sdf;

  // Draw the border
  if (edgeDist < uBorderPx) {
    gl_FragColor = vec4(uColor, 1.0);
    return;
  }

  // Draw the texture
  if (uHasMap > 0.5) {
    gl_FragColor = vec4(texture2D(uMap, vec2(vUv.x, 1.0 - vUv.y)).rgb, 1.0);
    return;
  }

  // Draw the empty fill
  if (uFill > 0.0) {
    gl_FragColor = vec4(uColor, uFill);
    return;
  }

  discard;
}`;

function makeMaterial(accentColor = DEFAULT_GUIDE_COLOR) {
  return new THREE.ShaderMaterial({
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,  // Changed from true to false for better blending
    blending: THREE.NormalBlending,  // Explicit normal blending
    uniforms: {
      uMap: { value: null },
      uHasMap: { value: 0 },
      uFacePx: { value: new THREE.Vector2(1, 1) },
      uBorderPx: { value: BORDER_PX },
      uColor: { value: new THREE.Color(accentColor) },
      uFill: { value: 0.0 },  // Changed from 0.1 to 0.0 to remove empty fill tint
      uRadiusPx: { value: 0 },
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
    // NOTE: Do NOT set texture.colorSpace = THREE.SRGBColorSpace here.
    // With a custom ShaderMaterial the GPU would decode the texture to linear
    // on sample, but this shader writes straight to the sRGB canvas without
    // re-encoding, which makes captured photos render dark/tinted.
    // Leaving the texture as raw sRGB bytes displays it exactly as captured.
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

function AnimatedBox({ stepKey, fromKey, captured, guideWidth, guideHeight, modelId = DEFAULT_MODEL_ID, accentColor }) {
  const group = useRef();
  const propsRef = useRef();
  propsRef.current = { stepKey, guideWidth, guideHeight };

  const faceConfigs = useMemo(() => getFaceConfigs(modelId), [modelId]);
  const model = useMemo(() => getModel(modelId), [modelId]);
  
  const faceMap = useMemo(() => {
    const map = {};
    faceConfigs.forEach((c) => { map[c.key] = c; });
    return map;
  }, [faceConfigs]);

  const initPose = POSES[fromKey] || POSES[stepKey];
  const curRef = useRef({ rx: initPose.rx, ry: initPose.ry, s: 0 });
  const animRef = useRef(null);

  const materials = useMemo(() => {
    const m = {};
    faceConfigs.forEach((c) => { m[c.key] = makeMaterial(accentColor); });
    return m;
  }, [faceConfigs, accentColor]);
  
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);

  // Update shader uniforms dynamically when the theme accent color changes
  useEffect(() => {
    const color = accentColor || DEFAULT_GUIDE_COLOR;
    Object.values(materials).forEach(m => {
      m.uniforms.uColor.value.set(color);
    });
  }, [accentColor, materials]);

  useEffect(() => {
    const to = POSES[stepKey];
    animRef.current = {
      fromRx: curRef.current.rx, fromRy: curRef.current.ry, fromS: curRef.current.s,
      toRx: to.rx, toRy: to.ry, start: -1,
    };
  }, [stepKey]);

  useFrame((state, delta) => {
    // Guard against initial frame where size might not be measured yet
    if (!state.size.height || !state.size.width) return;

    // FIX: For an OrthographicCamera, the `zoom` property IS the exact pixels-per-world-unit.
    // We use a fixed zoom of 100, so 1 world unit = 100 pixels.
    const proj = 100;

    const { stepKey: key, guideWidth: gw, guideHeight: gh } = propsRef.current;
    const cfg = faceMap[key];
    
    // Safety check in case a model doesn't define this specific face key
    if (!cfg) return; 
    
    const sTarget = Math.min(gw / (cfg.width * proj), gh / (cfg.height * proj));

    const a = animRef.current;
    if (a) {
      if (a.start < 0) {
        a.start = state.clock.elapsedTime;
        if (!a.fromS) a.fromS = sTarget;
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

    faceConfigs.forEach((c) => {
      if (materials[c.key]) {
        const scaledWidth = c.width * curRef.current.s * proj;
        const scaledHeight = c.height * curRef.current.s * proj;
        materials[c.key].uniforms.uFacePx.value.set(scaledWidth, scaledHeight);
        
        // Dynamically scale the corner radius to match the current zoom/scale
        const scaledRadius = (model.cornerRadius || 0) * curRef.current.s * proj;
        materials[c.key].uniforms.uRadiusPx.value = scaledRadius;
      }
    });
  });

  return (
    <group ref={group}>
      {faceConfigs.map((cfg) => (
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
  const [preferences, setPreferences] = useState({ theme: DEFAULT_THEME_ID });

  // Load theme preferences
  useEffect(() => {
    const loadPrefs = async () => {
      try {
        const prefsJSON = await AsyncStorage.getItem('media_cabinet_preferences');
        if (prefsJSON) setPreferences(JSON.parse(prefsJSON));
      } catch (e) {
        console.error('Failed to load prefs', e);
      }
    };
    loadPrefs();
  }, []);

  const theme = getTheme(preferences.theme);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} collapsable={false}>
      <Canvas
        gl={{ alpha: true, antialias: true }}
        style={{ backgroundColor: 'transparent' }}
        // FIX: Switch to OrthographicCamera. This eliminates ALL perspective distortion.
        // The 3D geometry will now render at the EXACT same pixel dimensions as your 2D guide box.
        orthographic
        camera={{ position: [0, 0, 10], zoom: 100 }}
        onCreated={({ gl }) => gl.setClearAlpha(0)}
      >
        <AnimatedBox {...props} accentColor={theme.accent} />
      </Canvas>
    </View>
  );
}