import React, { Suspense, useState, useMemo, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useProgress } from '@react-three/drei';
import { MediaItem3D } from './Media3DViewer';
import { getModel, DEFAULT_MODEL_ID } from './mediaModels';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTheme, DEFAULT_THEME_ID } from './theme';

function PreviewLoader({ theme, styles }) {
  const { active } = useProgress();
  if (!active) return null;
  return (
    <View style={styles.loadingOverlay}>
      <ActivityIndicator size="small" color={theme.accent} />
    </View>
  );
}

export default function Media3DPreview({ textureMap, modelId, style }) {
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

  const [isRotating, setIsRotating] = useState(true);

  const activeModelId = modelId || textureMap?.modelId || DEFAULT_MODEL_ID;

  // Dynamically adjust camera distance based on the model's largest dimension.
  // e.g., Standard Media (1.87 tall) -> ~3.5 distance. Vinyl (3.14 tall) -> ~5.9 distance.
  const cameraZ = useMemo(() => {
    const dims = getModel(activeModelId).dims;
    const maxDim = Math.max(dims.w, dims.h, dims.d);
    return Math.max(3.5, maxDim * 1.87);
  }, [activeModelId]);

  if (!textureMap) return null;

  const toggleRotation = () => setIsRotating(prev => !prev);

  return (
    <View style={[styles.container, style]}>
      <Canvas
        camera={{ position: [0, 0, cameraZ], fov: 45 }}
        gl={{ antialias: true }}
        onPointerMissed={toggleRotation} // Tapping the background toggles rotation
      >
        <color attach="background" args={[theme.cardBackground]} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <Suspense fallback={null}>
          {/* Tapping the 3D model itself toggles rotation */}
          <group onClick={toggleRotation}>
            <MediaItem3D 
              textureMap={textureMap} 
              modelId={activeModelId} 
              bodyColor={theme.cardBackground}
              placeholderColor={theme.cardBackground}
              missingColor={theme.background}
            />
          </group>
        </Suspense>
        <OrbitControls 
          enablePan={false} 
          enableZoom={false} 
          autoRotate={isRotating}
          autoRotateSpeed={3} 
          enableDamping 
          dampingFactor={0.1}
        />
      </Canvas>
      <PreviewLoader theme={theme} styles={styles} />
    </View>
  );
}

const getStyles = (theme) => ({
  container: {
    width: '100%',
    height: 250,
    backgroundColor: theme.cardBackground,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  }
});