import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteTape, saveTape } from './tapeStorage';
import { useFocusEffect } from '@react-navigation/native';
import Tape3DPreview from './Tape3DPreview';
import { resolveModelId } from './mediaModels';

export default function TapeDetailScreen({ route, navigation }) {
  const { tape } = route.params;
  const returnToCollection = route.params?.returnToCollection || false;
  const [currentTape, setCurrentTape] = useState(tape);

  // Determine the active 3D model ID. Falls back to resolving from format/caseType
  // for legacy tapes that were saved before the mediaModels registry existed.
  const activeModelId = currentTape.modelId || currentTape.textureMap?.modelId || resolveModelId(currentTape.format, currentTape.caseType);

  useFocusEffect(
    useCallback(() => {
      const fetchPending = async () => {
        try {
          const pendingJSON = await AsyncStorage.getItem('pending_texture_map');
          if (pendingJSON) {
            const parsedMap = JSON.parse(pendingJSON);
            setCurrentTape(prev => {
              const updated = { ...prev, textureMap: parsedMap };
              // If the scan captured a specific modelId, persist it to the tape record
              if (parsedMap.modelId) {
                updated.modelId = parsedMap.modelId;
              }
              saveTapeToStorage(updated);
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

  const saveTapeToStorage = async (tapeToSave) => {
    try {
      await saveTape(tapeToSave);
    } catch (error) {
      console.error('Failed to update tape with 3D scan', error);
    }
  };

  const handleDelete = async () => {
    Alert.alert(
      'Delete Tape',
      `Are you sure you want to delete "${currentTape.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTape(currentTape.id);
              
              handleBack();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete the tape.');
            }
          }
        }
      ]
    );
  };

  const handleEdit = () => {
    navigation.navigate('AddTape', { tape: currentTape, returnToCollection });
  };

  const handleBack = () => {
    const collectionRoute = navigation
      .getState()
      .routes
      .find(stackRoute => stackRoute.name === 'CollectionDetail');

    if (returnToCollection && collectionRoute && navigation.popTo) {
      // popTo replaces params by default. Preserve the collection object the
      // screen needs rather than returning to it with undefined route.params.
      navigation.popTo('CollectionDetail', collectionRoute.params);
      return;
    }
    navigation.goBack();
  };

  const displayImage = currentTape.coverPhoto || (currentTape.posterPath ? `https://image.tmdb.org/t/p/w500${currentTape.posterPath}` : null);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{currentTape.title}</Text>
        <View style={{ width: 24 }} /> 
      </View>

      <View style={styles.content}>
        {currentTape.textureMap ? (
          <View style={styles.previewWrapper}>
            <Tape3DPreview textureMap={currentTape.textureMap} modelId={activeModelId} style={{ width: '100%', height: 250 }} />
            
            {/* Fullscreen Overlay Button (Bottom Right) */}
            <TouchableOpacity 
              style={styles.overlayButton} 
              onPress={() => navigation.navigate('Tape3DViewer', { textureMap: currentTape.textureMap, title: currentTape.title, modelId: activeModelId })}
            >
              <Ionicons name="expand-outline" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {displayImage ? (
              <Image source={{ uri: displayImage }} style={styles.coverImage} resizeMode="cover" />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Ionicons name="videocam-outline" size={64} color="#666666" />
              </View>
            )}
            {/* Fallback button when no 3D scan exists yet */}
            <TouchableOpacity 
              style={styles.scan3DFallbackButton} 
              onPress={() => navigation.navigate('ReelScan', { returnTo: 'TapeDetail', modelId: activeModelId })}
            >
              <Ionicons name="scan-outline" size={20} color="#ffffff" />
              <Text style={styles.scan3DFallbackButtonText}>Scan 3D Box</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={styles.infoSection}>
          <Text style={styles.mainTitle}>{currentTape.title}</Text>
          <Text style={styles.subTitle}>{currentTape.year} • {currentTape.format} • {currentTape.runtime || 'Unknown'}</Text>
          
          {currentTape.tagline ? (
            <Text style={styles.tagline}>"{currentTape.tagline}"</Text>
          ) : null}

          {currentTape.genres && currentTape.genres.length > 0 ? (
            <View style={styles.genresContainer}>
              {currentTape.genres.map((genre, index) => (
                <View key={index} style={styles.genreChip}>
                  <Text style={styles.genreText}>{genre}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.divider} />

          {currentTape.overview ? (
            <>
              <Text style={styles.sectionLabel}>Overview</Text>
              <Text style={styles.overviewText}>{currentTape.overview}</Text>
              <View style={styles.divider} />
            </>
          ) : null}

          <View style={styles.crewGrid}>
            <DetailItem icon="person-outline" label="Director" value={currentTape.director || 'Unknown'} />
            <DetailItem icon="create-outline" label="Writer" value={currentTape.writer || 'Unknown'} />
            <DetailItem icon="calendar-outline" label="Release Date" value={currentTape.releaseDate || 'Unknown'} />
            <DetailItem icon="business-outline" label="Distributor" value={currentTape.distributor || 'Unknown'} />
          </View>

          <View style={styles.divider} />

          {currentTape.productionCompanies && currentTape.productionCompanies.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>Production</Text>
              <Text style={styles.detailValue}>{currentTape.productionCompanies.join(', ')}</Text>
              <View style={styles.divider} />
            </>
          ) : null}

          {(currentTape.budget || currentTape.revenue) ? (
            <>
              <Text style={styles.sectionLabel}>Financials</Text>
              <View style={styles.financialRow}>
                <View style={styles.financialItem}>
                  <Text style={styles.financialLabel}>Budget</Text>
                  <Text style={styles.financialValue}>{currentTape.budget || 'Unknown'}</Text>
                </View>
                <View style={styles.financialItem}>
                  <Text style={styles.financialLabel}>Revenue</Text>
                  <Text style={styles.financialValue}>{currentTape.revenue || 'Unknown'}</Text>
                </View>
              </View>
              <View style={styles.divider} />
            </>
          ) : null}

          {currentTape.notes ? (
            <>
              <Text style={styles.sectionLabel}>Notes / Condition</Text>
              <Text style={styles.notesText}>{currentTape.notes}</Text>
              <View style={styles.divider} />
            </>
          ) : null}

          {currentTape.barcode ? (
            <View style={styles.barcodeRow}>
              <Ionicons name="barcode-outline" size={18} color="#888888" />
              <Text style={styles.barcodeText}> {currentTape.barcode}</Text>
            </View>
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
  coverPlaceholder: { width: 180, height: 270, borderRadius: 12, marginBottom: 20, backgroundColor: '#2a2a2a', justifyContent: 'center', alignItems: 'center' },
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
  barcodeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  barcodeText: { fontSize: 14, color: '#666666', fontFamily: 'monospace' },
  actionButtons: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 16, gap: 16 },
  actionButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16, borderRadius: 12, gap: 8 },
  editButton: { backgroundColor: '#333333', borderWidth: 1, borderColor: '#444444' },
  deleteButton: { backgroundColor: '#e50914' },
  actionButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' }
});