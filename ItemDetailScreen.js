import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteItem, saveItem } from './mediaStorage';
import { useFocusEffect } from '@react-navigation/native';
import Media3DPreview from './Media3DPreview';
import { resolveModelId, getCategory, MEDIA_CATEGORIES } from './mediaModels';

export default function ItemDetailScreen({ route, navigation }) {
  const { item } = route.params;
  const returnToCollection = route.params?.returnToCollection || false;
  const [currentItem, setCurrentItem] = useState(item);

  // Determine the active 3D model ID. Falls back to resolving from format/caseType
  // for legacy items that were saved before the mediaModels registry existed.
  const activeModelId = currentItem.modelId || currentItem.textureMap?.modelId || resolveModelId(currentItem.format, currentItem.caseType);
  
  // Determine category for dynamic UI
  const category = getCategory(activeModelId);
  const isMusic = category === MEDIA_CATEGORIES.MUSIC;

  useFocusEffect(
    useCallback(() => {
      const fetchPending = async () => {
        try {
          const pendingJSON = await AsyncStorage.getItem('pending_texture_map');
          if (pendingJSON) {
            const parsedMap = JSON.parse(pendingJSON);
            setCurrentItem(prev => {
              const updated = { ...prev, textureMap: parsedMap };
              // If the scan captured a specific modelId, persist it to the item record
              if (parsedMap.modelId) {
                updated.modelId = parsedMap.modelId;
              }
              saveItemToStorage(updated);
              return updated;
            });
            await AsyncStorage.removeItem('pending_texture_map');
          }
        } catch (e) {
          console.error('Failed to load pending texture map', e);
        }
      };
      fetchPending();
    }, [])
  );

  const saveItemToStorage = async (itemToSave) => {
    try {
      await saveItem(itemToSave);
    } catch (error) {
      console.error('Failed to update item with 3D scan', error);
    }
  };

  const handleDelete = async () => {
    Alert.alert(
      'Delete Item',
      `Are you sure you want to delete "${currentItem.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteItem(currentItem.id);
              
              handleBack();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete the item.');
            }
          }
        }
      ]
    );
  };

  const handleEdit = () => {
    navigation.navigate('AddItem', { item: currentItem, returnToCollection });
  };

  const handleBack = () => {
    const collectionRoute = navigation
      .getState()
      .routes
      .find(stackRoute => stackRoute.name === 'CollectionDetail');

    if (returnToCollection && collectionRoute && navigation.popTo) {
      navigation.popTo('CollectionDetail', collectionRoute.params);
      return;
    }
    navigation.goBack();
  };

  const renderTracklist = () => {
    if (!isMusic || !currentItem.tracklist || currentItem.tracklist.length === 0) return null;

    const currentStyle = currentItem.tracklistStyle || 'sequential';

    if (currentStyle === 'sides') {
      let currentSide = null;
      const groupedTracks = [];

      currentItem.tracklist.forEach((track, index) => {
        const side = track.position ? track.position.match(/[A-Z]/i)?.[0] : null;
        
        if (side && side !== currentSide) {
          currentSide = side;
          groupedTracks.push(
            <Text key={`side-${side}-${index}`} style={styles.sideHeader}>
              Side {side.toUpperCase()}
            </Text>
          );
        }
        
        groupedTracks.push(
          <View key={index} style={styles.trackRow}>
            <Text style={styles.trackPosition}>{track.position || `${index + 1}`}</Text>
            <Text style={styles.trackTitle}>{track.title}</Text>
            <Text style={styles.trackDuration}>{track.duration || ''}</Text>
          </View>
        );
      });

      return (
        <>
          <Text style={styles.sectionLabel}>Tracklist</Text>
          <View style={styles.tracklistContainer}>
            {groupedTracks}
          </View>
          <View style={styles.divider} />
        </>
      );
    }

    // Sequential (CDs, etc)
    return (
      <>
        <Text style={styles.sectionLabel}>Tracklist</Text>
        <View style={styles.tracklistContainer}>
          {currentItem.tracklist.map((track, index) => (
            <View key={index} style={styles.trackRow}>
              <Text style={styles.trackPosition}>{track.position || `${index + 1}`}</Text>
              <Text style={styles.trackTitle}>{track.title}</Text>
              <Text style={styles.trackDuration}>{track.duration || ''}</Text>
            </View>
          ))}
        </View>
        <View style={styles.divider} />
      </>
    );
  };

  // Support new coverArtUrl and legacy posterPath fallback
  const displayImage = currentItem.coverPhoto || currentItem.coverArtUrl || (currentItem.posterPath ? `https://image.tmdb.org/t/p/w500${currentItem.posterPath}` : null);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{currentItem.title}</Text>
        <View style={{ width: 24 }} /> 
      </View>

      <View style={styles.content}>
        {currentItem.textureMap ? (
          <View style={styles.previewWrapper}>
            <Media3DPreview textureMap={currentItem.textureMap} modelId={activeModelId} style={{ width: '100%', height: 250 }} />
            
            {/* Fullscreen Overlay Button (Bottom Right) */}
            <TouchableOpacity 
              style={styles.overlayButton} 
              onPress={() => navigation.navigate('Media3DViewer', { textureMap: currentItem.textureMap, title: currentItem.title, modelId: activeModelId })}
            >
              <Ionicons name="expand-outline" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {displayImage ? (
              <Image 
                source={{ uri: displayImage }} 
                style={[styles.coverImage, isMusic && styles.coverImageMusic]} 
                resizeMode="cover" 
              />
            ) : (
              <View style={[styles.coverPlaceholder, isMusic && styles.coverPlaceholderMusic]}>
                <Ionicons name={isMusic ? "musical-notes-outline" : "videocam-outline"} size={64} color="#666666" />
              </View>
            )}
            {/* Fallback button when no 3D scan exists yet */}
            <TouchableOpacity 
              style={styles.scan3DFallbackButton} 
              onPress={() => navigation.navigate('MediaScan', { returnTo: 'ItemDetail', modelId: activeModelId })}
            >
              <Ionicons name="scan-outline" size={20} color="#ffffff" />
              <Text style={styles.scan3DFallbackButtonText}>Scan 3D Item</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={styles.infoSection}>
          <Text style={styles.mainTitle}>{currentItem.title}</Text>
          <Text style={styles.subTitle}>{currentItem.year} • {currentItem.format} • {currentItem.runtime || 'Unknown'}</Text>
          
          {currentItem.tagline ? (
            <Text style={styles.tagline}>
              {isMusic ? `Cat# ${currentItem.tagline}` : `"${currentItem.tagline}"`}
            </Text>
          ) : null}

          {currentItem.genres && currentItem.genres.length > 0 ? (
            <View style={styles.genresContainer}>
              {currentItem.genres.map((genre, index) => (
                <View key={index} style={styles.genreChip}>
                  <Text style={styles.genreText}>{genre}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.divider} />

          {currentItem.overview ? (
            <>
              <Text style={styles.sectionLabel}>Overview</Text>
              <Text style={styles.overviewText}>{currentItem.overview}</Text>
              <View style={styles.divider} />
            </>
          ) : null}

          <View style={styles.crewGrid}>
            <DetailItem icon={isMusic ? "mic-outline" : "person-outline"} label={isMusic ? "Artist" : "Director"} value={currentItem.director || 'Unknown'} />
            <DetailItem icon="create-outline" label={isMusic ? "Producer / Writer" : "Writer"} value={currentItem.writer || 'Unknown'} />
            <DetailItem icon="calendar-outline" label="Release Date" value={currentItem.releaseDate || 'Unknown'} />
            <DetailItem icon={isMusic ? "disc-outline" : "business-outline"} label={isMusic ? "Label" : "Distributor"} value={currentItem.distributor || 'Unknown'} />
          </View>

          <View style={styles.divider} />

          {currentItem.productionCompanies && currentItem.productionCompanies.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>Production</Text>
              <Text style={styles.detailValue}>{currentItem.productionCompanies.join(', ')}</Text>
              <View style={styles.divider} />
            </>
          ) : null}

          {renderTracklist()}

          {!isMusic && (currentItem.budget || currentItem.revenue) ? (
            <>
              <Text style={styles.sectionLabel}>Financials</Text>
              <View style={styles.financialRow}>
                <View style={styles.financialItem}>
                  <Text style={styles.financialLabel}>Budget</Text>
                  <Text style={styles.financialValue}>{currentItem.budget || 'Unknown'}</Text>
                </View>
                <View style={styles.financialItem}>
                  <Text style={styles.financialLabel}>Revenue</Text>
                  <Text style={styles.financialValue}>{currentItem.revenue || 'Unknown'}</Text>
                </View>
              </View>
              <View style={styles.divider} />
            </>
          ) : null}

          {currentItem.notes ? (
            <>
              <Text style={styles.sectionLabel}>Notes / Condition</Text>
              <Text style={styles.notesText}>{currentItem.notes}</Text>
              <View style={styles.divider} />
            </>
          ) : null}
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity style={[styles.actionButton, styles.editButton]} onPress={handleEdit}>
            <Ionicons name="create-outline" size={20} color="#ffffff" />
            <Text style={styles.actionButtonText}>Edit</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={20} color="#ffffff" />
            <Text style={styles.actionButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const DetailItem = ({ icon, label, value }) => (
  <View style={styles.detailItem}>
    <Ionicons name={icon} size={18} color="#e50914" />
    <View style={styles.detailTextContainer}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  scrollContent: { paddingBottom: 40 },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 20, 
    paddingTop: 60, 
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333333'
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#ffffff', flex: 1, textAlign: 'center' },
  iconButton: { padding: 8 },
  content: { padding: 20, alignItems: 'center' },
  
  previewWrapper: {
    width: '100%',
    height: 250,
    marginBottom: 20,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1e1e1e',
  },
  overlayButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },

  scan3DFallbackButton: {
    flexDirection: 'row',
    backgroundColor: '#333333',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#444444',
    gap: 8,
    marginBottom: 20,
    width: '100%',
  },
  scan3DFallbackButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },

  coverImage: { width: 180, height: 270, borderRadius: 12, marginBottom: 20, backgroundColor: '#2a2a2a' },
  coverImageMusic: { width: 270, height: 270 }, // Square for albums
  coverPlaceholder: { width: 180, height: 270, borderRadius: 12, marginBottom: 20, backgroundColor: '#2a2a2a', justifyContent: 'center', alignItems: 'center' },
  coverPlaceholderMusic: { width: 270, height: 270 }, // Square for albums
  infoSection: { width: '100%', backgroundColor: '#1e1e1e', borderRadius: 12, padding: 20, borderWidth: 1, borderColor: '#333333' },
  mainTitle: { fontSize: 24, fontWeight: 'bold', color: '#ffffff', textAlign: 'center', marginBottom: 4 },
  subTitle: { fontSize: 15, color: '#aaaaaa', textAlign: 'center', marginBottom: 12 },
  tagline: { fontSize: 14, color: '#888888', fontStyle: 'italic', textAlign: 'center', marginBottom: 16 },
  genresContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 16 },
  genreChip: { backgroundColor: 'rgba(229, 9, 20, 0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  genreText: { color: '#e50914', fontSize: 12, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#333333', marginVertical: 16 },
  sectionLabel: { fontSize: 13, color: '#888888', fontWeight: 'bold', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  overviewText: { fontSize: 15, color: '#cccccc', lineHeight: 22 },
  crewGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16 },
  detailItem: { flexDirection: 'row', alignItems: 'center', width: '48%', marginBottom: 12 },
  detailTextContainer: { flex: 1, marginLeft: 8 },
  detailLabel: { fontSize: 11, color: '#888888', marginBottom: 2 },
  detailValue: { fontSize: 14, color: '#ffffff', fontWeight: '500' },
  financialRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  financialItem: { alignItems: 'center', flex: 1 },
  financialLabel: { fontSize: 12, color: '#888888', marginBottom: 4 },
  financialValue: { fontSize: 16, color: '#4CAF50', fontWeight: 'bold' },
  notesText: { fontSize: 15, color: '#cccccc', lineHeight: 22, fontStyle: 'italic' },
  tracklistContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#333333',
  },
  sideHeader: {
    color: '#e07a5f',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  trackRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
    alignItems: 'center',
  },
  trackPosition: {
    width: 40,
    color: '#888888',
    fontSize: 14,
  },
  trackTitle: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
  },
  trackDuration: {
    color: '#888888',
    fontSize: 14,
    marginLeft: 10,
  },
  actionButtons: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 16, gap: 16 },
  actionButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16, borderRadius: 12, gap: 8 },
  editButton: { backgroundColor: '#333333', borderWidth: 1, borderColor: '#444444' },
  deleteButton: { backgroundColor: '#e50914' },
  actionButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' }
});