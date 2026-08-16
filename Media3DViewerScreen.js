import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Media3DViewer from './Media3DViewer';
import { DEFAULT_MODEL_ID } from './mediaModels';
import { getTheme, DEFAULT_THEME_ID } from './theme';

const Media3DViewerScreen = ({ route, navigation }) => {
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

  const { textureMap, title, modelId } = route.params || {};
  const activeModelId = modelId || textureMap?.modelId || DEFAULT_MODEL_ID;

  return (
    <View style={styles.container}>
      {/* 3D Canvas */}
      <Media3DViewer textureMap={textureMap} modelId={activeModelId} />

      {/* UI Overlay */}
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
        </TouchableOpacity>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{title || '3D Model'}</Text>
        </View>
      </View>
    </View>
  );
};

const getStyles = (theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.background,
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
    backgroundColor: theme.backdrop,
    borderRadius: 20,
    padding: 8,
    pointerEvents: 'auto', // Re-enables touches for the button
  },
  titleContainer: {
    position: 'absolute',
    bottom: 72,
    left: 24,
    right: 24,
    pointerEvents: 'none',
  },
  title: {
    color: theme.textPrimary,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600',
    textAlign: 'center',
    // Added text shadow to ensure the title is readable against any theme's 3D background
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

export default Media3DViewerScreen;