import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Tape3DViewer from './Tape3DViewer';

const { width, height } = Dimensions.get('window');

const Tape3DViewerScreen = ({ route, navigation }) => {
  const { textureMap, title } = route.params || {};

  return (
    <View style={styles.container}>
      {/* 3D Canvas */}
      <Tape3DViewer textureMap={textureMap} />

      {/* UI Overlay */}
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.headerContainer}>
          <Ionicons name="cube-outline" size={20} color="#e07a5f" />
          <Text style={styles.title}>{title || '3D Model'}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'box-none', // Allows touches to pass through to the 3D canvas
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    padding: 8,
    pointerEvents: 'auto', // Re-enables touches for the button
  },
  headerContainer: {
    position: 'absolute',
    top: 55,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    pointerEvents: 'none',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default Tape3DViewerScreen;