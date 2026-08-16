import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './HomeScreen';
import CollectionDetailScreen from './CollectionDetailScreen';
import ItemFormScreen from './ItemFormScreen';
import SearchScreen from './SearchScreen';
import ItemDetailScreen from './ItemDetailScreen';
import Media3DViewerScreen from './Media3DViewerScreen';
import MediaScanScreen from './MediaScanScreen';

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
          name="AddItem" 
          component={ItemFormScreen} 
          options={({ route }) => ({ 
            title: route.params?.item ? 'Edit Item' : 'Add New Item' 
          })}
        />
        <Stack.Screen 
          name="Search" 
          component={SearchScreen} 
          options={{ title: 'Search TMDB' }} 
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}