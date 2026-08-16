import React, { Suspense, useEffect, useState, useMemo } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { warpQuad } from './modules/quad-detect';
import { 
  getFaceConfigs, 
  getModel, 
  getCameraDistance, 
  DEFAULT_MODEL_ID 
} from './mediaModels';
import { getTheme, DEFAULT_THEME_ID } from './theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Native warp produces the image in normal Android Bitmap orientation.
// EXGL does not reliably honor WebGL's texture flip flag, so we explicitly
// flip V in the Three.js UV transform below instead of depending on EXGL.
const WARP_FLIP_V = false;

const warpCache = new Map();
const EMPTY_TEXTURE_MAP = {};

// Legacy export for components not yet migrated to modelId (e.g. GuideBox3D)
export const FACE_CONFIGS = getFaceConfigs(DEFAULT_MODEL_ID);

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
function FacePlane({ config, texture, isPlaceholder = false, placeholderColor = '#303030', missingColor = '#151515' }) {
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
        color={texture ? '#ffffff' : isPlaceholder ? placeholderColor : missingColor}
        roughness={config.roughness}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/**
 * Takes one photographed face.
 */
function LoadedFaces({ faces, placeholderColor, missingColor }) {
  const textures = useTexture(faces.map(face => face.url));
  return faces.map((face, index) => (
    <FacePlane 
      key={face.config.key} 
      config={face.config} 
      texture={textures[index]} 
      placeholderColor={placeholderColor}
      missingColor={missingColor}
    />
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
          console.error(`[Media3D] ${config.key}: warp failed`, error);
          return null;
        })
    );
  }
  return warpCache.get(cacheKey);
}

function ResolvedFaces({ textureMap, modelId, placeholderColor, missingColor }) {
  const configs = useMemo(() => getFaceConfigs(modelId), [modelId]);
  const sourceKey = configs.map(config => textureSourceKey(textureMap?.[config.key])).join('::');
  const [faces, setFaces] = useState(null);

  useEffect(() => {
    let alive = true;
    setFaces(null);

    Promise.all(configs.map(async config => ({
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
  }, [sourceKey, configs]);

  if (!faces) {
    return configs.map(config => (
      <FacePlane 
        key={config.key} 
        config={config} 
        isPlaceholder 
        placeholderColor={placeholderColor} 
        missingColor={missingColor} 
      />
    ));
  }

  const loadedKeys = new Set(faces.map(face => face.config.key));
  return (
    <>
      {faces.length > 0 && <LoadedFaces faces={faces} placeholderColor={placeholderColor} missingColor={missingColor} />}
      {configs.filter(config => !loadedKeys.has(config.key)).map(config => (
        <FacePlane 
          key={config.key} 
          config={config} 
          placeholderColor={placeholderColor} 
          missingColor={missingColor} 
        />
      ))}
    </>
  );
}

/**
 * A rigid physical media body.
 */
export function MediaItem3D({ 
  textureMap, 
  modelId = DEFAULT_MODEL_ID, 
  bodyColor = '#171717',
  placeholderColor = '#303030',
  missingColor = '#151515'
}) {
  const map = textureMap || EMPTY_TEXTURE_MAP;
  const dims = getModel(modelId).dims;

  return (
    <group>
      {/* Solid physical body */}
      <mesh>
        <boxGeometry
          args={[dims.w, dims.h, dims.d]}
        />
        <meshStandardMaterial
          color={bodyColor}
          roughness={0.72}
          metalness={0}
        />
      </mesh>

      <ResolvedFaces 
        textureMap={map} 
        modelId={modelId} 
        placeholderColor={placeholderColor}
        missingColor={missingColor}
      />
    </group>
  );
}

function Loader({ theme, styles }) {
  const { active } = useProgress();

  if (!active) return null;

  return (
    <View style={styles.loadingOverlay}>
      <ActivityIndicator
        size="large"
        color={theme.accent}
      />
      <Text style={styles.loadingText}>
        Mapping Textures...
      </Text>
    </View>
  );
}

export default function Media3DViewer({
  textureMap,
  modelId = DEFAULT_MODEL_ID,
}) {
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
  const styles = getStyles(theme);

  const cameraParams = useMemo(() => {
    const aspect = SCREEN_WIDTH / SCREEN_HEIGHT;
    const z = getCameraDistance(modelId, aspect);

    return {
      z,
      minDist: z * 0.5,
      maxDist: z * 2.5,
    };
  }, [modelId]);

  return (
    <View style={styles.container}>
      <Canvas
        camera={{
          position: [0, 0, cameraParams.z],
          fov: 50,
        }}
        style={styles.canvas}
        gl={{ antialias: true }}
      >
        <color
          attach="background"
          args={[theme.background]}
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
          <MediaItem3D 
            textureMap={textureMap} 
            modelId={modelId} 
            bodyColor={theme.cardBackground}
            placeholderColor={theme.cardBackground}
            missingColor={theme.background}
          />
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
          minDistance={cameraParams.minDist}
          maxDistance={cameraParams.maxDist}
        />
      </Canvas>

      <Loader theme={theme} styles={styles} />
    </View>
  );
}

const getStyles = (theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  canvas: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.backdrop,
    zIndex: 10,
  },
  loadingText: {
    marginTop: 12,
    color: theme.accent,
    fontSize: 16,
    fontWeight: '600',
  },
});