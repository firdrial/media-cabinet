import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTvSeasonsList } from './tmdbService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTheme, DEFAULT_THEME_ID } from './theme';

export default function TvReleaseSelectScreen({ route, navigation }) {
  const [preferences, setPreferences] = useState({ theme: DEFAULT_THEME_ID });
  const [seasons, setSeasons] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const searchResult = route.params?.searchResult;
  const collectionId = route.params?.collectionId || null;
  const allowedFormats = route.params?.allowedFormats || [];
  const returnToCollection = route.params?.returnToCollection || false;
  const tvId = searchResult?.id;

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

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

  useEffect(() => {
    const fetchSeasons = async () => {
      if (!tvId) {
        navigation.goBack();
        return;
      }
      setIsLoading(true);
      const seasonsData = await getTvSeasonsList(tvId);
      // Sort seasons: Specials (0) at the end, then 1, 2, 3...
      const sortedSeasons = seasonsData.sort((a, b) => {
        if (a.season_number === 0) return 1;
        if (b.season_number === 0) return -1;
        return a.season_number - b.season_number;
      });
      setSeasons(sortedSeasons);
      setIsLoading(false);
    };

    fetchSeasons();
  }, [tvId, navigation]);

  const theme = getTheme(preferences.theme);
  const styles = getStyles(theme);

  const handleSelectSeason = (seasonNumber) => {
    // Pass the selected season number (or 'complete') back to the Item Form
    navigation.navigate('AddItem', {
      searchResult: {
        ...searchResult,
        selectedSeason: seasonNumber // 'complete' or a number (e.g., 1)
      },
      collectionId,
      allowedFormats,
      returnToCollection,
    });
  };

  const renderSeasonItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.seasonCard} 
      onPress={() => handleSelectSeason(item.season_number)}
      activeOpacity={0.7}
    >
      {item.coverArtUrl ? (
        <Image source={{ uri: item.coverArtUrl }} style={styles.seasonPoster} resizeMode="cover" />
      ) : (
        <View style={styles.seasonPosterPlaceholder}>
          <Ionicons name="tv-outline" size={32} color={theme.textMuted} />
        </View>
      )}
      <View style={styles.seasonInfo}>
        <Text style={styles.seasonName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.seasonMeta}>
          {item.episode_count} Episode{item.episode_count !== 1 ? 's' : ''} • {item.air_date !== 'Unknown' ? item.air_date.split('-')[0] : 'Unknown'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={24} color={theme.textMuted} />
    </TouchableOpacity>
  );

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
        <Text style={styles.customHeaderTitle} numberOfLines={1}>Select Release</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.showBanner}>
        <Text style={styles.showBannerText}>Adding {searchResult?.title}</Text>
      </View>

      {/* Complete Series Option */}
      <TouchableOpacity 
        style={styles.completeSeriesCard} 
        onPress={() => handleSelectSeason('complete')}
        activeOpacity={0.7}
      >
        <View style={styles.completeIconContainer}>
          <Ionicons name="layers-outline" size={28} color={theme.accent} />
        </View>
        <View style={styles.seasonInfo}>
          <Text style={styles.completeSeriesName}>Complete Series</Text>
          <Text style={styles.seasonMeta}>
            {seasons.reduce((acc, curr) => acc + curr.episode_count, 0)} Total Episodes
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color={theme.textMuted} />
      </TouchableOpacity>

      <View style={styles.divider} />

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={styles.loadingText}>Fetching seasons...</Text>
        </View>
      ) : seasons.length > 0 ? (
        <FlatList
          data={seasons}
          renderItem={renderSeasonItem}
          keyExtractor={(item) => item.season_number.toString()}
          contentContainerStyle={styles.list}
        />
      ) : (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No season data available for this show.</Text>
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
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  customHeaderTitle: { fontSize: 18, fontWeight: 'bold', color: theme.headerTitle, flex: 1, textAlign: 'center' },
  showBanner: {
    backgroundColor: theme.accentSoft,
    padding: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.cardBorder,
  },
  showBannerText: { color: theme.accent, fontSize: 14, fontWeight: '600' },
  completeSeriesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.cardBackground,
    padding: 16,
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.accent,
  },
  completeIconContainer: {
    width: 50,
    height: 75,
    borderRadius: 8,
    backgroundColor: theme.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  seasonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.cardBackground,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  seasonPoster: { width: 50, height: 75, borderRadius: 8, marginRight: 16, backgroundColor: theme.chipBackground },
  seasonPosterPlaceholder: { width: 50, height: 75, borderRadius: 8, marginRight: 16, backgroundColor: theme.chipBackground, justifyContent: 'center', alignItems: 'center' },
  seasonInfo: { flex: 1 },
  seasonName: { fontSize: 16, fontWeight: 'bold', color: theme.titleText, marginBottom: 4 },
  completeSeriesName: { fontSize: 18, fontWeight: 'bold', color: theme.accent, marginBottom: 4 },
  seasonMeta: { fontSize: 13, color: theme.textSecondary },
  divider: { height: 1, backgroundColor: theme.cardBorder, marginHorizontal: 16, marginBottom: 10 },
  list: { paddingBottom: 20 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: theme.textSecondary, marginTop: 10, fontSize: 16 },
  emptyText: { color: theme.textMuted, fontSize: 16, textAlign: 'center' }
});