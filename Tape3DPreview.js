import React, { Suspense, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useProgress } from '@react-three/drei';
import { VHSTape } from './Tape3DViewer';

function PreviewLoader() {
  const { active } = useProgress();
  if (!active) return null;
  return (
    <View style={styles.loadingOverlay}>
      <ActivityIndicator size="small" color="#e07a5f" />
    </View>
  );
}

export default function Tape3DPreview({ textureMap, style }) {
  const [isRotating, setIsRotating] = useState(true);

  if (!textureMap) return null;

  const toggleRotation = () => setIsRotating(prev => !prev);

  return (
    <View style={[styles.container, style]}>
      <Canvas
        camera={{ position: [0, 0, 3.5], fov: 45 }}
        gl={{ antialias: true }}
        onPointerMissed={toggleRotation} // Tapping the background toggles rotation
      >
        <color attach="background" args={['#1e1e1e']} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <Suspense fallback={null}>
          {/* Tapping the 3D model itself toggles rotation */}
          <group onClick={toggleRotation}>
            <VHSTape textureMap={textureMap} />
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
      <PreviewLoader />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 250,
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333333',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
