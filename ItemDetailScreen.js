import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Alert, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import { deleteItem, saveItem } from './mediaStorage';
import { useFocusEffect } from '@react-navigation/native';
import Media3DPreview from './Media3DPreview';
import { resolveModelId, getCategory, MEDIA_CATEGORIES } from './mediaModels';
import { getTheme, DEFAULT_THEME_ID } from './theme';
import { clearWarpCache } from './Media3DViewer';

export default function ItemDetailScreen({ route, navigation }) {
  const { item } = route.params;
  const returnToCollection = route.params?.returnToCollection || false;
  const [currentItem, setCurrentItem] = useState(item);
  const [preferences, setPreferences] = useState({ theme: DEFAULT_THEME_ID });
  
  // State for collapsible TV seasons
  const [expandedSeasons, setExpandedSeasons] = useState({});

  // Load theme preferences
  useEffect(() => {
    const loadPrefs = async () => {
      try {
        const prefsJSON = await AsyncStorage.getItem('media_cabinet_preferences');
        if (prefsJSON) {
          setPreferences(JSON.parse(prefsJSON));
        }
      } catch (e) {
        console.error('Failed to load prefs', e);
      }
    };
    loadPrefs();
  }, []);

  const theme = getTheme(preferences.theme);
  const styles = getStyles(theme);

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
              if (parsedMap.modelId) {
                updated.modelId = parsedMap.modelId;
              }

              // Clean up old textures that were replaced
              if (prev.textureMap) {
                const newUris = new Set();
                Object.values(parsedMap).forEach(face => {
                  if (face?.uri && face.uri.startsWith('file://')) newUris.add(face.uri);
                });
                
                for (const faceData of Object.values(prev.textureMap)) {
                  if (faceData?.uri && faceData.uri.startsWith('file://') && !newUris.has(faceData.uri)) {
                    try {
                      const file = new File(faceData.uri);
                      if (file.exists) file.delete();
                    } catch (e) {
                      console.warn('[ItemDetail] Failed to delete replaced texture:', e);
                    }
                  }
                }
              }

              clearWarpCache();
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

  const toggleSeason = (season) => {
    setExpandedSeasons(prev => ({
      ...prev,
      [season]: prev[season] === false ? true : false
    }));
  };

  const renderTracklist = () => {
    if (!currentItem.tracklist || currentItem.tracklist.length === 0) return null;

    // Check if it's a TV tracklist (has 'season' property)
    const isTvTracklist = currentItem.tracklist[0].season !== undefined;

    if (isTvTracklist) {
      const groupedBySeason = {};
      currentItem.tracklist.forEach(ep => {
        const s = ep.season !== undefined ? ep.season : 0;
        if (!groupedBySeason[s]) groupedBySeason[s] = [];
        groupedBySeason[s].push(ep);
      });

      const sortedSeasons = Object.keys(groupedBySeason).sort((a, b) => Number(a) - Number(b));

      return (
        <>
          <Text style={styles.sectionLabel}>Episodes on this Release</Text>
          <View style={styles.tracklistContainer}>
            {sortedSeasons.map(season => {
              const seasonName = season === '0' ? 'Specials' : `Season ${season}`;
              const isExpanded = expandedSeasons[season] !== false; // Default to expanded

              return (
                <View key={season} style={styles.seasonGroup}>
                  <TouchableOpacity 
                    style={styles.seasonHeader} 
                    onPress={() => toggleSeason(season)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.seasonHeaderText}>{seasonName} ({groupedBySeason[season].length} eps)</Text>
                    <Ionicons 
                      name={isExpanded ? "chevron-up" : "chevron-down"} 
                      size={20} 
                      color={theme.textMuted} 
                    />
                  </TouchableOpacity>
                  
                  {isExpanded && (
                    <View style={styles.episodesList}>
                      {groupedBySeason[season].map((ep, index) => (
                        <View key={`${season}-${index}`} style={styles.trackRow}>
                          <Text style={styles.trackPosition}>E{ep.position}</Text>
                          <View style={styles.episodeTitleContainer}>
                            <Text style={styles.trackTitle} numberOfLines={2}>{ep.title}</Text>
                            {ep.air_date && ep.air_date !== 'Unknown' && (
                              <Text style={styles.episodeAirDate}>{ep.air_date}</Text>
                            )}
                          </View>
                          <Text style={styles.trackDuration}>{ep.duration || ''}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
          <View style={styles.divider} />
        </>
      );
    }

    // Existing music logic
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

  // Smart formatting for physical TV release info in the subtitle
  const formatTvSeason = (season) => {
    if (!season) return '';
    const str = String(season).trim();
    return /^\d+$/.test(str) ? `Season ${str}` : str;
  };

  const volumeInfoText = currentItem.volumeInfo ? ` • ${currentItem.volumeInfo}` : '';
  const tvInfo = currentItem.tvSeason ? ` • ${formatTvSeason(currentItem.tvSeason)}` : '';
  const epInfo = currentItem.episodeCount ? ` • ${currentItem.episodeCount} Episodes` : '';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{currentItem.title}</Text>
        <View style={{ width: 24 }} /> 
      </View>

      <View style={styles.content}>
        {currentItem.textureMap ? (
          <View style={styles.previewWrapper}>
            <Media3DPreview textureMap={currentItem.textureMap} modelId={activeModelId} style={{ width: '100%', height: 250 }} title={item.title} />
            
            <TouchableOpacity 
              style={styles.overlayButton} 
              onPress={() => navigation.navigate('Media3DViewer', { textureMap: currentItem.textureMap, title: currentItem.title, modelId: activeModelId })}
            >
              <Ionicons name="expand-outline" size={22} color={theme.pillText} />
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
                <Ionicons name={isMusic ? "musical-notes-outline" : "videocam-outline"} size={64} color={theme.textMuted} />
              </View>
            )}
            <TouchableOpacity 
              style={styles.scan3DFallbackButton} 
              onPress={() => navigation.navigate('MediaScan', { returnTo: 'ItemDetail', modelId: activeModelId })}
            >
              <Ionicons name="scan-outline" size={20} color={theme.textPrimary} />
              <Text style={styles.scan3DFallbackButtonText}>Scan 3D Item</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={styles.infoSection}>
          <Text style={styles.mainTitle}>{currentItem.title}</Text>
          
          <Text style={styles.subTitle}>
            {currentItem.year} • {currentItem.format}{volumeInfoText}{tvInfo}{epInfo} • {currentItem.runtime || 'Unknown'}
          </Text>
          
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
            <DetailItem icon={isMusic ? "mic-outline" : "person-outline"} label={isMusic ? "Artist" : "Director / Creator"} value={currentItem.director || 'Unknown'} iconColor={theme.accent} styles={styles} />
            <DetailItem icon="create-outline" label={isMusic ? "Producer / Writer" : "Writer"} value={currentItem.writer || 'Unknown'} iconColor={theme.accent} styles={styles} />
            <DetailItem icon="calendar-outline" label="Release Date" value={currentItem.releaseDate || 'Unknown'} iconColor={theme.accent} styles={styles} />
            <DetailItem icon={isMusic ? "disc-outline" : "business-outline"} label={isMusic ? "Label" : "Distributor"} value={currentItem.distributor || 'Unknown'} iconColor={theme.accent} styles={styles} />
            
            {!isMusic && (currentItem.tvSeason || currentItem.episodeCount) && (
              <DetailItem 
                icon="layers-outline" 
                label="Release Contents" 
                value={`${currentItem.tvSeason ? String(currentItem.tvSeason).trim() : ''}${currentItem.episodeCount ? ` (${currentItem.episodeCount} eps)` : ''}`.trim()} 
                iconColor={theme.accent} 
                styles={styles} 
              />
            )}
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
            <Ionicons name="create-outline" size={20} color={theme.textPrimary} />
            <Text style={[styles.actionButtonText, { color: theme.textPrimary }]}>Edit</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={20} color={theme.onAccent} />
            <Text style={[styles.actionButtonText, { color: theme.onAccent }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const DetailItem = ({ icon, label, value, iconColor, styles }) => (
  <View style={styles.detailItem}>
    <Ionicons name={icon} size={18} color={iconColor} />
    <View style={styles.detailTextContainer}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  </View>
);

const getStyles = (theme) => ({
  container: { flex: 1, backgroundColor: theme.background },
  scrollContent: { paddingBottom: 40 },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 20, 
    paddingTop: 60, 
    backgroundColor: theme.headerBackground,
    borderBottomWidth: 1,
    borderBottomColor: theme.headerBorder
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.headerTitle, flex: 1, textAlign: 'center' },
  iconButton: { padding: 8 },
  content: { padding: 20, alignItems: 'center' },
  
  previewWrapper: {
    width: '100%',
    height: 250,
    marginBottom: 20,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: theme.cardBackground,
  },
  overlayButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.pillBackground,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.pillBorder,
  },

  scan3DFallbackButton: {
    flexDirection: 'row',
    backgroundColor: theme.chipBackground,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.sheetBorder,
    gap: 8,
    marginBottom: 20,
    width: '100%',
  },
  scan3DFallbackButtonText: {
    color: theme.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },

  coverImage: { width: 180, height: 270, borderRadius: 12, marginBottom: 20, backgroundColor: theme.chipBackground },
  coverImageMusic: { width: 270, height: 270 },
  coverPlaceholder: { width: 180, height: 270, borderRadius: 12, marginBottom: 20, backgroundColor: theme.chipBackground, justifyContent: 'center', alignItems: 'center' },
  coverPlaceholderMusic: { width: 270, height: 270 },
  infoSection: { width: '100%', backgroundColor: theme.cardBackground, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: theme.cardBorder },
  mainTitle: { fontSize: 24, fontWeight: 'bold', color: theme.titleText, textAlign: 'center', marginBottom: 4 },
  subTitle: { fontSize: 15, color: theme.textSecondary, textAlign: 'center', marginBottom: 12 },
  tagline: { fontSize: 14, color: theme.textMuted, fontStyle: 'italic', textAlign: 'center', marginBottom: 16 },
  genresContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 16 },
  genreChip: { backgroundColor: theme.accentSoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  genreText: { color: theme.accent, fontSize: 12, fontWeight: '600' },
  divider: { height: 1, backgroundColor: theme.cardBorder, marginVertical: 16 },
  sectionLabel: { fontSize: 13, color: theme.textMuted, fontWeight: 'bold', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  overviewText: { fontSize: 15, color: theme.textPrimary, lineHeight: 22 },
  crewGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16 },
  detailItem: { flexDirection: 'row', alignItems: 'center', width: '48%', marginBottom: 12 },
  detailTextContainer: { flex: 1, marginLeft: 8 },
  detailLabel: { fontSize: 11, color: theme.textMuted, marginBottom: 2 },
  detailValue: { fontSize: 14, color: theme.textPrimary, fontWeight: '500' },
  financialRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  financialItem: { alignItems: 'center', flex: 1 },
  financialLabel: { fontSize: 12, color: theme.textMuted, marginBottom: 4 },
  financialValue: { fontSize: 16, color: theme.accent, fontWeight: 'bold' },
  notesText: { fontSize: 15, color: theme.textPrimary, lineHeight: 22, fontStyle: 'italic' },
  tracklistContainer: {
    backgroundColor: theme.inputBackground,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  sideHeader: {
    color: theme.accent,
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
    borderBottomColor: theme.cardBorder,
    alignItems: 'center',
  },
  trackPosition: {
    width: 40,
    color: theme.textMuted,
    fontSize: 14,
  },
  trackTitle: {
    flex: 1,
    color: theme.textPrimary,
    fontSize: 14,
  },
  trackDuration: {
    color: theme.textMuted,
    fontSize: 14,
    marginLeft: 10,
  },
  actionButtons: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 16, gap: 16 },
  actionButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16, borderRadius: 12, gap: 8 },
  editButton: { backgroundColor: theme.chipBackground, borderWidth: 1, borderColor: theme.sheetBorder },
  deleteButton: { backgroundColor: theme.accent },
  actionButtonText: { fontSize: 16, fontWeight: 'bold' },
  
  // Collapsible TV Season Styles
  seasonGroup: {
    marginBottom: 12,
  },
  seasonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: theme.chipBackground,
    borderRadius: 8,
    marginBottom: 8,
  },
  seasonHeaderText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: theme.accent,
  },
  episodesList: {
    paddingLeft: 8,
  },
  episodeTitleContainer: {
    flex: 1,
    marginLeft: 12,
  },
  episodeAirDate: {
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 2,
  },
});