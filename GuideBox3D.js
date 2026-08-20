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
  front:  { rx: 0,              ry: 0, rz: 0 },
  left:   { rx: 0,              ry: Math.PI / 2, rz: 0 },
  back:   { rx: 0,              ry: Math.PI, rz: 0 },
  right:  { rx: 0,              ry: (3 * Math.PI) / 2, rz: 0 },
  top:    { rx: Math.PI / 2,    ry: 2 * Math.PI, rz: 0 },
  bottom: { rx: -Math.PI / 2,   ry: 2 * Math.PI, rz: 0 },
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

function AnimatedBox({ stepKey, fromKey, captured, guideWidth, guideHeight, modelId = DEFAULT_MODEL_ID, customData, accentColor }) {
  const group = useRef();
  const rollRef = useRef(); // Outer group: screen-space roll, applied AFTER the pose
  const propsRef = useRef();
  propsRef.current = { stepKey, guideWidth, guideHeight };

  const faceConfigs = useMemo(() => getFaceConfigs(modelId, customData), [modelId, customData]);

  console.log('📥 [GuideBox3D] Received:', { 
    modelId, 
    customData, 
    faces: faceConfigs.map(f => ({ key: f.key, w: f.width?.toFixed(3), h: f.height?.toFixed(3) })) 
  });

  const model = useMemo(() => getModel(modelId), [modelId]);
  
  const faceMap = useMemo(() => {
    const map = {};
    faceConfigs.forEach((c) => { map[c.key] = c; });
    return map;
  }, [faceConfigs]);

  const initPose = POSES[fromKey] || POSES[stepKey];
  const initKey = fromKey || stepKey;
  const initRz = faceMap[initKey]?.scanPortrait ? Math.PI / 2 : 0;
  const curRef = useRef({ rx: initPose.rx, ry: initPose.ry, rz: initRz, s: 0 });
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
    const cfg = faceMap[stepKey];
    const targetRz = cfg?.scanPortrait ? Math.PI / 2 : 0;

    animRef.current = {
      fromRx: curRef.current.rx, fromRy: curRef.current.ry, fromRz: curRef.current.rz, fromS: curRef.current.s,
      toRx: to.rx, toRy: to.ry, toRz: targetRz, start: -1,
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
    
    // When the guide box is portrait (scanPortrait), the entire group is rolled 90 degrees 
    // on screen. This means the physical width maps to the screen's height, and the 
    // physical height maps to the screen's width. We must swap the effective dimensions 
    // for the scale calculation so the rotated face perfectly fills the portrait anchor.
    const effW = cfg.scanPortrait ? cfg.height : cfg.width;
    const effH = cfg.scanPortrait ? cfg.width : cfg.height;

    const sTarget = Math.min(gw / (effW * proj), gh / (effH * proj));

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
      curRef.current.rz = a.fromRz + (a.toRz - a.fromRz) * e;
      curRef.current.s = a.fromS + (sTarget - a.fromS) * e;
      if (t >= 1) animRef.current = null;
    } else if (curRef.current.s) {
      curRef.current.s += (sTarget - curRef.current.s) * Math.min(1, delta * 8);
    }
    if (!curRef.current.s) curRef.current.s = sTarget;

    // Inner group: pose (pitch/yaw) + uniform scale, exactly as before.
    group.current.rotation.set(curRef.current.rx, curRef.current.ry, 0);
    group.current.scale.setScalar(curRef.current.s);

    // Outer group: screen-space roll applied AFTER the pose, in camera space.
    // This presents portrait-scanned faces upright without rotating the wrong
    // face toward the camera (the old single-group Euler composition bug).
    if (rollRef.current) {
      rollRef.current.rotation.set(0, 0, curRef.current.rz);
    }

    // Custom items typically have sharp corners unless explicitly specified otherwise
    const isCustom = customData?.caseType === 'custom';
    const baseCornerRadius = isCustom ? 0 : (model.cornerRadius || 0);

    faceConfigs.forEach((c) => {
      if (materials[c.key]) {
        const scaledWidth = c.width * curRef.current.s * proj;
        const scaledHeight = c.height * curRef.current.s * proj;
        materials[c.key].uniforms.uFacePx.value.set(scaledWidth, scaledHeight);
        
        // Dynamically scale the corner radius to match the current zoom/scale
        const scaledRadius = baseCornerRadius * curRef.current.s * proj;
        materials[c.key].uniforms.uRadiusPx.value = scaledRadius;
      }
    });
  });

  return (
    <group ref={rollRef}>
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