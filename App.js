import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './HomeScreen';
import CollectionDetailScreen from './CollectionDetailScreen';
import AddTapeScreen from './add-tape';
import BarcodeScanner from './BarcodeScanner';
import SearchScreen from './SearchScreen';
import TapeDetailScreen from './TapeDetailScreen';
import Tape3DViewerScreen from './Tape3DViewerScreen';
import ReelScanScreen from './ReelScanScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator 
        screenOptions={{
          headerStyle: { backgroundColor: '#121212' },
          headerTintColor: '#ffffff',
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
          name="AddTape" 
          component={AddTapeScreen} 
          options={({ route }) => ({ 
            title: route.params?.tape ? 'Edit Item' : 'Add New Item' 
          })}
        />
        <Stack.Screen 
          name="BarcodeScanner" 
          component={BarcodeScanner} 
          options={{ title: 'Barcode Scanner', headerBackTitle: 'Back' }} 
        />
        <Stack.Screen 
          name="Search" 
          component={SearchScreen} 
          options={{ title: 'Search TMDB' }} 
        />
        <Stack.Screen 
          name="TapeDetail" 
          component={TapeDetailScreen} 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="Tape3DViewer" 
          component={Tape3DViewerScreen} 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="ReelScan" 
          component={ReelScanScreen} 
          options={{ headerShown: false }} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}