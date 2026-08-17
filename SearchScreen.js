import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { searchMovieByText } from './tmdbService';
import { searchAlbumByText } from './musicService';
import { resolveModelId, getCategory, MEDIA_CATEGORIES } from './mediaModels';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTheme, DEFAULT_THEME_ID } from './theme';

export default function SearchScreen({ route, navigation }) {
  const [preferences, setPreferences] = useState({ theme: DEFAULT_THEME_ID });

  // Hide the native React Navigation header so we can use our custom one
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

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
  
  const allowedFormats = route.params?.allowedFormats || [];
  const displayFormat = allowedFormats.length > 0 ? allowedFormats[0] : 'Unknown';
  
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
      allowedFormats,
      returnToCollection,
    });
  };

  const renderResult = ({ item }) => {
    const posterUrl = item.coverArtUrl;

    return (
      <TouchableOpacity style={styles.resultCard} onPress={() => handleSelectItem(item)}>
        {posterUrl ? (
          <Image 
            source={{ uri: posterUrl }} 
            style={[styles.resultPoster, isMusic && styles.resultPosterMusic]} 
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.resultPosterPlaceholder, isMusic && styles.resultPosterMusic]} />
        )}
        
        <View style={styles.resultInfo}>
          <Text style={styles.resultTitle} numberOfLines={2}>{item.title}</Text>
          
          {item.artist ? (
            <Text style={styles.resultFormat} numberOfLines={1}>{item.artist}</Text>
          ) : item.director ? (
            <Text style={styles.resultFormat} numberOfLines={1}>{item.director}</Text>
          ) : null}
          
          <Text style={styles.resultYear}>{item.year}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.customHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={28} color={theme.headerTitle} />
        </TouchableOpacity>
        <Text style={styles.customHeaderTitle}>Search</Text>
        <View style={{ width: 40 }} />
      </View>

      {collectionId && allowedFormats.length > 0 && (
        <View style={styles.collectionBanner}>
          <Text style={styles.collectionBannerText}>
            Adding {displayFormat} to Collection
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
          <Text style={styles.loadingText}>Searching {isMusic ? 'Music' : 'Movies'}...</Text>
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
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: theme.headerBackground,
    borderBottomWidth: 1,
    borderBottomColor: theme.headerBorder,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.headerTitle,
  },
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
  resultPosterMusic: { width: 60, height: 60 },
  resultPosterPlaceholder: { width: 50, height: 75, borderRadius: 6, marginRight: 12, backgroundColor: theme.chipBackground },
  resultInfo: { flex: 1 },
  resultTitle: { fontSize: 16, fontWeight: 'bold', color: theme.titleText, marginBottom: 4 },
  resultYear: { fontSize: 14, color: theme.textSecondary },
  resultFormat: { fontSize: 13, color: theme.accent, marginTop: 2, marginBottom: 2, fontWeight: '500' }, 
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: theme.textSecondary, marginTop: 10, fontSize: 16 },
  emptyText: { color: theme.textMuted, fontSize: 16, textAlign: 'center' }
});