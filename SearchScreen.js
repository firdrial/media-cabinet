import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { searchMovieByText } from './apiService';

export default function SearchScreen({ route, navigation }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const collectionId = route.params?.collectionId || null;
  const returnToCollection = route.params?.returnToCollection || false;
  // Default to empty array to safely extract the single format
  const allowedFormats = route.params?.allowedFormats || [];
  const displayFormat = allowedFormats.length > 0 ? allowedFormats[0] : 'Unknown';

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setIsLoading(true);
    const searchResults = await searchMovieByText(query);
    setResults(searchResults);
    setIsLoading(false);
  };

  const handleSelectMovie = (movie) => {
    navigation.navigate('AddItem', { 
      searchResult: movie,
      collectionId,
      allowedFormats, // Preserved as an array to prevent breaking ItemFormScreen
      returnToCollection,
    });
  };

  const renderResult = ({ item }) => {
    const posterUrl = item.poster_path 
      ? `https://image.tmdb.org/t/p/w154${item.poster_path}` 
      : null;

    return (
      <TouchableOpacity style={styles.resultCard} onPress={() => handleSelectMovie(item)}>
        {posterUrl ? (
          <Image 
            source={{ uri: posterUrl }} 
            style={styles.resultPoster} 
            resizeMode="cover"
          />
        ) : (
          <View style={styles.resultPosterPlaceholder} />
        )}
        
        <View style={styles.resultInfo}>
          <Text style={styles.resultTitle}>{item.title}</Text>
          <Text style={styles.resultYear}>{item.year}</Text>
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
          placeholder="Search by title..."
          placeholderTextColor="#888888"
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
          <ActivityIndicator size="large" color="#e50914" />
          <Text style={styles.loadingText}>Searching TMDB...</Text>
        </View>
      ) : results.length > 0 ? (
        <FlatList
          data={results}
          renderItem={renderResult}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.list}
        />
      ) : (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            {query.length > 0 ? 'No results found. Try a different title.' : 'Type a movie title above to search.'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  collectionBanner: {
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    padding: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  collectionBannerText: {
    color: '#e50914',
    fontSize: 14,
    fontWeight: '600',
  },
  searchBar: { flexDirection: 'row', padding: 15, backgroundColor: '#1a1a1a', borderBottomWidth: 1, borderBottomColor: '#333333' },
  input: { flex: 1, backgroundColor: '#2a2a2a', color: '#ffffff', padding: 12, borderRadius: 8, fontSize: 16, marginRight: 10 },
  searchButton: { backgroundColor: '#e50914', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, borderRadius: 8 },
  searchButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 },
  list: { padding: 15 },
  resultCard: { backgroundColor: '#1e1e1e', padding: 12, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#333333', flexDirection: 'row', alignItems: 'center' },
  resultPoster: { width: 50, height: 75, borderRadius: 6, marginRight: 12, backgroundColor: '#333333' },
  resultPosterPlaceholder: { width: 50, height: 75, borderRadius: 6, marginRight: 12, backgroundColor: '#2a2a2a' },
  resultInfo: { flex: 1 },
  resultTitle: { fontSize: 16, fontWeight: 'bold', color: '#ffffff', marginBottom: 4 },
  resultYear: { fontSize: 14, color: '#aaaaaa' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: '#aaaaaa', marginTop: 10, fontSize: 16 },
  emptyText: { color: '#888888', fontSize: 16, textAlign: 'center' }
});