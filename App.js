// ============================================================
// POLYFILL FOR @react-three/drei IN REACT NATIVE
// Stops Metro from crashing when it evaluates web-only modules 
// (like PositionalAudio) during the bundle process.
// ============================================================
if (typeof document === 'undefined') {
  global.document = {
    createElement: () => ({
      getContext: () => ({ measureText: () => ({ width: 0 }), canvas: {} }),
      style: {},
    }),
    head: {},
    body: {},
  };
}
if (typeof window === 'undefined') {
  global.window = {};
}
global.window.AudioContext = global.window.AudioContext || class AudioContext {
  constructor() { this.destination = {}; }
  createGain() { return { connect: () => {}, gain: { value: 0 } }; }
  createPanner() { return { connect: () => {} }; }
};
if (typeof Worker === 'undefined') {
  global.Worker = class Worker { constructor() {} postMessage() {} terminate() {} };
}

import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HomeScreen from './HomeScreen';
import CollectionDetailScreen from './CollectionDetailScreen';
import ItemFormScreen from './ItemFormScreen';
import SearchScreen from './SearchScreen';
import ItemDetailScreen from './ItemDetailScreen';
import Media3DViewerScreen from './Media3DViewerScreen';
import MediaScanScreen from './MediaScanScreen';
import TvReleaseSelectScreen from './TvReleaseSelectScreen'; // <-- ADDED
import { getTheme, DEFAULT_THEME_ID } from './theme';

const Stack = createNativeStackNavigator();

export default function App() {
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID);

  // Load theme preferences for the native stack headers
  useEffect(() => {
    const loadPrefs = async () => {
      try {
        const prefsJSON = await AsyncStorage.getItem('media_cabinet_preferences');
        if (prefsJSON) {
          const parsed = JSON.parse(prefsJSON);
          if (parsed.theme) {
            setThemeId(parsed.theme);
          }
        }
      } catch (e) {
        console.error('Failed to load prefs in App.js', e);
      }
    };
    loadPrefs();
  }, []);

  const theme = getTheme(themeId);

  return (
    <NavigationContainer>
      <Stack.Navigator 
        screenOptions={{
          headerStyle: { backgroundColor: theme.headerBackground },
          headerTintColor: theme.headerTitle,
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Stack.Screen 
          name="Home" 
          component={HomeScreen} 
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="CollectionDetail" 
          component={CollectionDetailScreen} 
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="AddItem" 
          component={ItemFormScreen} 
          options={({ route }) => ({ 
            title: route.params?.item ? 'Edit Item' : 'Add New Item' 
          })}
        />
        <Stack.Screen 
          name="Search" 
          component={SearchScreen} 
          options={{ title: 'Search' }} 
        />
        <Stack.Screen 
          name="ItemDetail" 
          component={ItemDetailScreen} 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="Media3DViewer" 
          component={Media3DViewerScreen} 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="MediaScan" 
          component={MediaScanScreen} 
          options={{ headerShown: false }} 
        />
        {/* NEW: TV Release Selection Screen */}
        <Stack.Screen 
          name="TvReleaseSelect" 
          component={TvReleaseSelectScreen} 
          options={{ headerShown: false }} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}