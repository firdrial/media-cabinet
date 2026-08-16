import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { searchMovieByText } from './tmdbService';
import { searchAlbumByText } from './discogsService';
import { resolveModelId, getCategory, MEDIA_CATEGORIES } from './mediaModels';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTheme, DEFAULT_THEME_ID } from './theme';

export default function SearchScreen({ route, navigation }) {
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

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const collectionId = route.params?.collectionId || null;
  const returnToCollection = route.params?.returnToCollection || false;
  
  // Default to empty array to safely extract the single format
  const allowedFormats = route.params?.allowedFormats || [];
  const displayFormat = allowedFormats.length > 0 ? allowedFormats[0] : 'Unknown';
  
  // Determine the media category to route the search to the correct API
  const primaryFormat = allowedFormats.length > 0 ? allowedFormats[0] : 'VHS';
  const modelId = resolveModelId(primaryFormat);
  const category = getCategory(modelId);
  const isMusic = category === MEDIA_CATEGORIES.MUSIC;

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setIsLoading(true);
    
    let searchResults = [];
    if (isMusic) {
      searchResults = await searchAlbumByText(query);
    } else {
      searchResults = await searchMovieByText(query);
    }
    
    setResults(searchResults);
    setIsLoading(false);
  };

  const handleSelectItem = (item) => {
    navigation.navigate('AddItem', { 
      searchResult: item,
      collectionId,
      allowedFormats, // Preserved as an array to prevent breaking ItemFormScreen
      returnToCollection,
    });
  };

  const renderResult = ({ item }) => {
    // Use the standardized coverArtUrl provided by both services
    const posterUrl = item.coverArtUrl;

    return (
      <TouchableOpacity style={styles.resultCard} onPress={() => handleSelectItem(item)}>
        {posterUrl ? (
          <Image 
            source={{ uri: posterUrl }} 
            // Apply square dimensions for music formats
            style={[styles.resultPoster, isMusic && styles.resultPosterMusic]} 
            resizeMode="cover"
          />
        ) : (
          // Apply square dimensions for music formats
          <View style={[styles.resultPosterPlaceholder, isMusic && styles.resultPosterMusic]} />
        )}
        
        <View style={styles.resultInfo}>
          <Text style={styles.resultTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.resultYear}>{item.year}</Text>
          {isMusic && item.formatPreview ? (
            <Text style={styles.resultFormat} numberOfLines={1}>{item.formatPreview}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {collectionId && allowedFormats.length > 0 && (
        <View style={styles.collectionBanner}>
          <Text style={styles.collectionBannerText}>
            Adding to collection ({displayFormat})
          </Text>
        </View>
      )}
      
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          placeholder={isMusic ? "Search by album or artist..." : "Search by title..."}
          placeholderTextColor={theme.placeholderText}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={styles.loadingText}>Searching {isMusic ? 'Discogs' : 'TMDB'}...</Text>
        </View>
      ) : results.length > 0 ? (
        <FlatList
          data={results}
          renderItem={renderResult}
          keyExtractor={(item, index) => item.id ? item.id.toString() : index.toString()}
          contentContainerStyle={styles.list}
        />
      ) : (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            {query.length > 0 ? 'No results found. Try a different title.' : `Type a ${isMusic ? 'music' : 'movie'} title above to search.`}
          </Text>
        </View>
      )}
    </View>
  );
}

const getStyles = (theme) => ({
  container: { flex: 1, backgroundColor: theme.background },
  collectionBanner: {
    backgroundColor: theme.accentSoft,
    padding: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.cardBorder,
  },
  collectionBannerText: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  searchBar: { flexDirection: 'row', padding: 15, backgroundColor: theme.headerBackground, borderBottomWidth: 1, borderBottomColor: theme.headerBorder },
  input: { flex: 1, backgroundColor: theme.inputBackground, color: theme.inputText, padding: 12, borderRadius: 8, fontSize: 16, marginRight: 10 },
  searchButton: { backgroundColor: theme.accent, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, borderRadius: 8 },
  searchButtonText: { color: theme.onAccent, fontWeight: 'bold', fontSize: 16 },
  list: { padding: 15 },
  resultCard: { backgroundColor: theme.cardBackground, padding: 12, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: theme.cardBorder, flexDirection: 'row', alignItems: 'center' },
  resultPoster: { width: 50, height: 75, borderRadius: 6, marginRight: 12, backgroundColor: theme.chipBackground },
  resultPosterMusic: { width: 60, height: 60 }, // Square aspect ratio for albums
  resultPosterPlaceholder: { width: 50, height: 75, borderRadius: 6, marginRight: 12, backgroundColor: theme.chipBackground },
  resultInfo: { flex: 1 },
  resultTitle: { fontSize: 16, fontWeight: 'bold', color: theme.titleText, marginBottom: 4 },
  resultYear: { fontSize: 14, color: theme.textSecondary },
  resultFormat: { fontSize: 12, color: theme.accent, marginTop: 2 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: theme.textSecondary, marginTop: 10, fontSize: 16 },
  emptyText: { color: theme.textMuted, fontSize: 16, textAlign: 'center' }
});