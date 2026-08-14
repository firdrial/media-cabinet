import React, { Suspense, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Text,
} from 'react-native';

import { Canvas } from '@react-three/fiber';
import {
  useTexture,
  OrbitControls,
  useProgress,
} from '@react-three/drei';

import * as THREE from 'three';
import { warpQuad } from './modules/quad-detect';

const VHS_W = 1.03;
const VHS_H = 1.87;
const VHS_D = 0.25;

// Small offset so the texture planes sit just outside the solid VHS body.
// This eliminates z-fighting while remaining visually flush.
const FACE_EPS = 0.0015;

// Native warp produces the image in normal Android Bitmap orientation.
// EXGL does not reliably honor WebGL's texture flip flag, so we explicitly
// flip V in the Three.js UV transform below instead of depending on EXGL.
const WARP_FLIP_V = false;

// Physical face output dimensions.
// Order:
// right, left, top, bottom, front, back
export const FACE_CONFIGS = [
  { key: 'front', width: VHS_W, height: VHS_H, outW: 1030, outH: 1870, position: [0, 0, VHS_D / 2 + FACE_EPS], rotation: [0, 0, 0], roughness: 0.38 },
  { key: 'back', width: VHS_W, height: VHS_H, outW: 1030, outH: 1870, position: [0, 0, -(VHS_D / 2 + FACE_EPS)], rotation: [0, Math.PI, 0], roughness: 0.38 },
  { key: 'right', width: VHS_D, height: VHS_H, outW: 250, outH: 1870, position: [VHS_W / 2 + FACE_EPS, 0, 0], rotation: [0, Math.PI / 2, 0], roughness: 0.42 },
  { key: 'left', width: VHS_D, height: VHS_H, outW: 250, outH: 1870, position: [-(VHS_W / 2 + FACE_EPS), 0, 0], rotation: [0, -Math.PI / 2, 0], roughness: 0.42 },
  { key: 'top', width: VHS_W, height: VHS_D, outW: 1030, outH: 250, position: [0, VHS_H / 2 + FACE_EPS, 0], rotation: [-Math.PI / 2, 0, 0], roughness: 0.5 },
  { key: 'bottom', width: VHS_W, height: VHS_D, outW: 1030, outH: 250, position: [0, -(VHS_H / 2 + FACE_EPS), 0], rotation: [Math.PI / 2, 0, 0], roughness: 0.5 },
];

const warpCache = new Map();
const EMPTY_TEXTURE_MAP = {};

function faceUrl(face) {
  if (!face) return null;
  return typeof face === 'string' ? face : face.uri;
}

function faceCorners(face) {
  if (!face || typeof face === 'string') return null;

  return Array.isArray(face.corners) && face.corners.length === 4
    ? face.corners
    : null;
}

/**
 * Applies an explicit vertical UV flip.
 *
 * This is deliberately done in the texture coordinate transform rather
 * than texture.flipY because EXGL's texture upload path is unreliable
 * with UNPACK_FLIP_Y_WEBGL.
 */
function configureTexture(texture) {
  texture.flipY = false;

  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;

  texture.repeat.set(1, -1);
  texture.offset.set(0, 1);

  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  texture.generateMipmaps = false;
  texture.anisotropy = 1;

  texture.colorSpace = THREE.SRGBColorSpace;

  texture.needsUpdate = true;
}

/**
 * Loads a successfully warped face.
 */
function FacePlane({ config, texture, isPlaceholder = false }) {
  if (texture) configureTexture(texture);

  return (
    <mesh
      position={config.position}
      rotation={config.rotation}
      renderOrder={texture ? 2 : 1}
    >
      <planeGeometry args={[config.width, config.height]} />
      <meshStandardMaterial
        map={texture || null}
        // Three.js multiplies a map by the material color. Textured faces
        // must remain white so their image pixels are not darkened to black.
        color={texture ? '#ffffff' : isPlaceholder ? '#303030' : '#151515'}
        roughness={config.roughness}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/**
 * Takes one photographed face:
 *
 * camera image
 *      ↓
 * detected quad
 *      ↓
 * native perspective rectification
 *      ↓
 * exact physical rectangle
 *      ↓
 * explicit 3D face
 */
function LoadedFaces({ faces }) {
  const textures = useTexture(faces.map(face => face.url));
  return faces.map((face, index) => (
    <FacePlane key={face.config.key} config={face.config} texture={textures[index]} />
  ));
}

function textureSourceKey(face) {
  if (!face) return '';
  if (typeof face === 'string') return `ready:${face}`;
  return [face.uri || '', face.warpedUri || '', face.isWarped ? '1' : '0', JSON.stringify(face.corners || [])].join('|');
}

function getWarpedFaceUrl(face, config) {
  if (!face) return Promise.resolve(null);
  if (typeof face === 'string') return Promise.resolve(face);
  if (face.isWarped || face.warpedUri) return Promise.resolve(face.warpedUri || face.uri);

  const rawUrl = faceUrl(face);
  const corners = faceCorners(face);
  if (!rawUrl || !corners) return Promise.resolve(null);

  const cacheKey = `${config.key}|${rawUrl}|${JSON.stringify(corners)}`;
  if (!warpCache.has(cacheKey)) {
    warpCache.set(
      cacheKey,
      warpQuad(rawUrl, corners, config.outW, config.outH, WARP_FLIP_V)
        .then(result => result?.uri || null)
        .catch(error => {
          console.error(`[Tape3D] ${config.key}: warp failed`, error);
          return null;
        })
    );
  }
  return warpCache.get(cacheKey);
}

function ResolvedFaces({ textureMap }) {
  const sourceKey = FACE_CONFIGS.map(config => textureSourceKey(textureMap?.[config.key])).join('::');
  const [faces, setFaces] = useState(null);

  useEffect(() => {
    let alive = true;
    setFaces(null);

    Promise.all(FACE_CONFIGS.map(async config => ({
      config,
      url: await getWarpedFaceUrl(textureMap?.[config.key], config),
    }))).then(resolved => {
      if (!alive) return;
      const readyFaces = resolved.filter(face => face.url);
      readyFaces.forEach(face => useTexture.preload(face.url));
      setFaces(readyFaces);
    });

    return () => {
      alive = false;
    };
  }, [sourceKey]);

  if (!faces) {
    return FACE_CONFIGS.map(config => (
      <FacePlane key={config.key} config={config} isPlaceholder />
    ));
  }

  const loadedKeys = new Set(faces.map(face => face.config.key));
  return (
    <>
      {faces.length > 0 && <LoadedFaces faces={faces} />}
      {FACE_CONFIGS.filter(config => !loadedKeys.has(config.key)).map(config => (
        <FacePlane key={config.key} config={config} />
      ))}
    </>
  );
}

/**
 * A rigid physical VHS body.
 *
 * The box itself is deliberately kept untextured.
 * Six explicit planes sit exactly on its six surfaces and carry the
 * rectified photographs.
 *
 * This avoids relying on THREE.BoxGeometry's face-specific UV layout.
 */
export function VHSTape({ textureMap }) {
  const map = textureMap || EMPTY_TEXTURE_MAP;

  return (
    <group>
      {/* Solid physical VHS body */}
      <mesh>
        <boxGeometry
          args={[VHS_W, VHS_H, VHS_D]}
        />

        <meshStandardMaterial
          color="#171717"
          roughness={0.72}
          metalness={0}
        />
      </mesh>

      <ResolvedFaces textureMap={map} />
    </group>
  );
}

function Loader() {
  const { active } = useProgress();

  if (!active) return null;

  return (
    <View style={styles.loadingOverlay}>
      <ActivityIndicator
        size="large"
        color="#e07a5f"
      />

      <Text style={styles.loadingText}>
        Mapping Textures...
      </Text>
    </View>
  );
}

export default function Tape3DViewer({
  textureMap,
}) {
  return (
    <View style={styles.container}>
      <Canvas
        camera={{
          position: [0, 0, 3.2],
          fov: 50,
        }}
        style={styles.canvas}
        gl={{ antialias: true }}
      >
        <color
          attach="background"
          args={['#050505']}
        />

        <ambientLight intensity={0.72} />

        <directionalLight
          position={[10, 10, 10]}
          intensity={0.85}
        />

        <directionalLight
          position={[-10, -10, -10]}
          intensity={0.25}
        />

        <Suspense fallback={null}>
          <VHSTape textureMap={textureMap} />
        </Suspense>

        <OrbitControls
          makeDefault
          enablePan={false}
          enableZoom={true}
          enableRotate={true}
          enableDamping={true}
          rotateSpeed={2.0}
          zoomSpeed={1.5}
          dampingFactor={0.05}
          minDistance={1.5}
          maxDistance={8}
        />
      </Canvas>

      <Loader />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },

  canvas: {
    flex: 1,
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },

  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,

    justifyContent: 'center',
    alignItems: 'center',

    backgroundColor: 'rgba(5,5,5,0.72)',

    zIndex: 10,
  },

  loadingText: {
    marginTop: 12,
    color: '#e07a5f',
    fontSize: 16,
    fontWeight: '600',
  },
});
