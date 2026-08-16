import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
  ScrollView,
  Dimensions,
  Alert,
  Image,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadItems } from './mediaStorage';
import ShelfView3D from './ShelfView3D';
import { resolveModelId, getCategory, MEDIA_CATEGORIES } from './mediaModels';
import { getTheme, DEFAULT_THEME_ID } from './theme';

const { height } = Dimensions.get('window');

const DEFAULT_PREFERENCES = {
  sortBy: 'dateAdded',
  sortOrder: 'desc',
  filterDecades: [],
  filterGenres: [],
  filterDirectors: [],
  theme: DEFAULT_THEME_ID,
};

/*
 * ----------------------------------------------------------
 * VIEW MODES
 * ----------------------------------------------------------
 */
const VIEW_MODE_OPTIONS = [
  { value: 'grid', label: 'Grid View', icon: 'grid-outline' },
  { value: 'list', label: 'List View', icon: 'list-outline' },
  { value: '3d', label: '3D View', icon: 'cube-outline' },
];

export default function CollectionDetailScreen({ route, navigation }) {
  /*
   * ----------------------------------------------------------
   * COLLECTION
   * ----------------------------------------------------------
   */
  const initialCollection = route.params.collection;
  const [collection, setCollection] = useState(initialCollection);

  /*
   * ----------------------------------------------------------
   * ITEMS
   * ----------------------------------------------------------
   */
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [itemSearch, setItemSearch] = useState('');

  /*
   * ----------------------------------------------------------
   * MENUS
   * ----------------------------------------------------------
   */
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showSortFilterMenu, setShowSortFilterMenu] = useState(false);
  const [showViewMenu, setShowViewMenu] = useState(false);

  /*
   * ----------------------------------------------------------
   * PREFERENCES
   * ----------------------------------------------------------
   */
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);

  // Load current theme and generate dynamic styles
  const theme = getTheme(preferences.theme);
  const styles = getStyles(theme);

  /*
   * ----------------------------------------------------------
   * VIEW MODE
   * ----------------------------------------------------------
   */
  const [viewMode, setViewMode] = useState('grid');
  const type = collection.type || collection.allowedTypes?.[0] || 'Unknown';
  
  // Determine category for dynamic UI
  const modelId = resolveModelId(type);
  const category = getCategory(modelId);
  const isMusic = category === MEDIA_CATEGORIES.MUSIC;

  /*
   * ----------------------------------------------------------
   * LOAD PREFERENCES
   * ----------------------------------------------------------
   */
  const loadPreferences = async () => {
    try {
      const prefsJSON = await AsyncStorage.getItem('media_cabinet_preferences');
      if (prefsJSON) {
        const parsed = JSON.parse(prefsJSON);
        setPreferences({
          ...DEFAULT_PREFERENCES,
          ...parsed,
          filterDecades: parsed.filterDecades || [],
          filterGenres: parsed.filterGenres || [],
          filterDirectors: parsed.filterDirectors || [],
        });
      }
    } catch (error) {
      console.error('Failed to load preferences', error);
    }
  };

  /*
   * ----------------------------------------------------------
   * SAVE PREFERENCES
   * ----------------------------------------------------------
   */
  const savePreferences = async newPrefs => {
    try {
      setPreferences(newPrefs);
      await AsyncStorage.setItem(
        'media_cabinet_preferences',
        JSON.stringify(newPrefs)
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to save preferences');
    }
  };

  /*
   * ----------------------------------------------------------
   * LOAD ITEMS
   * ----------------------------------------------------------
   */
  const loadItemsFromStorage = async () => {
    try {
      const allItems = await loadItems();
      const collectionItems = allItems.filter(
        item => item.collectionId === collection.id
      );
      setItems(collectionItems);
    } catch (error) {
      console.error('Failed to load collection items', error);
    }
  };

  /*
   * ----------------------------------------------------------
   * INITIAL LOAD
   * ----------------------------------------------------------
   */
  useEffect(() => {
    const init = async () => {
      await loadPreferences();
      await loadItemsFromStorage();
    };
    init();
  }, []);

  /*
   * ----------------------------------------------------------
   * RELOAD WHEN SCREEN REGAINS FOCUS
   * ----------------------------------------------------------
   */
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadItemsFromStorage();
      loadPreferences();
    });
    return unsubscribe;
  }, [navigation, collection.id]);

  /*
   * ----------------------------------------------------------
   * VIEW MODE
   * ----------------------------------------------------------
   */
  const getViewModeIcon = () => {
    const option = VIEW_MODE_OPTIONS.find(o => o.value === viewMode);
    return option ? option.icon : 'grid-outline';
  };

  /*
   * ----------------------------------------------------------
   * UNIQUE FILTER VALUES
   * ----------------------------------------------------------
   */
  const uniqueDecades = useMemo(() => {
    const decades = items
      .map(item => {
        const year = parseInt(item.year, 10);
        if (!isNaN(year)) {
          const decade = Math.floor(year / 10) * 10;
          return `${decade}s`;
        }
        return null;
      })
      .filter(Boolean);
    return [...new Set(decades)].sort().reverse();
  }, [items]);

  const uniqueGenres = useMemo(() => {
    const allGenres = items.flatMap(item => {
      if (Array.isArray(item.genres)) return item.genres;
      if (typeof item.genres === 'string')
        return item.genres.split(',').map(g => g.trim());
      return [];
    });
    return [...new Set(allGenres)].filter(g => g).sort();
  }, [items]);

  const uniqueDirectors = useMemo(() => {
    const allDirectors = items.flatMap(item => {
      if (!item.director) return [];
      return item.director
        .split(',')
        .map(d => d.trim())
        .filter(d => d);
    });
    return [...new Set(allDirectors)].sort();
  }, [items]);

  /*
   * ----------------------------------------------------------
   * FILTER TOGGLE
   * ----------------------------------------------------------
   */
  const toggleFilter = (categoryKey, value) => {
    const currentList = preferences[categoryKey] || [];
    let newList;
    if (currentList.includes(value)) {
      newList = currentList.filter(item => item !== value);
    } else {
      newList = [...currentList, value];
    }
    savePreferences({ ...preferences, [categoryKey]: newList });
  };

  const hasActiveFilters =
    preferences.filterDecades?.length > 0 ||
    preferences.filterGenres?.length > 0 ||
    preferences.filterDirectors?.length > 0;

  /*
   * ----------------------------------------------------------
   * SEARCH → FILTER → SORT
   * ----------------------------------------------------------
   */
  useEffect(() => {
    let result = [...items];

    /* SEARCH */
    if (itemSearch.trim()) {
      const lowerSearch = itemSearch.toLowerCase();
      result = result.filter(item => {
        const title = (item.title || '').toLowerCase();
        const director = (item.director || '').toLowerCase();
        const format = (item.format || '').toLowerCase();
        return (
          title.includes(lowerSearch) ||
          director.includes(lowerSearch) ||
          format.includes(lowerSearch)
        );
      });
    }

    /* DECADE FILTER */
    if (preferences.filterDecades?.length > 0) {
      result = result.filter(item => {
        const year = parseInt(item.year, 10);
        if (isNaN(year)) return false;
        const decade = `${Math.floor(year / 10) * 10}s`;
        return preferences.filterDecades.includes(decade);
      });
    }

    /* GENRE FILTER */
    if (preferences.filterGenres?.length > 0) {
      result = result.filter(item => {
        const itemGenres = Array.isArray(item.genres)
          ? item.genres
          : typeof item.genres === 'string'
          ? item.genres.split(',').map(g => g.trim())
          : [];
        return preferences.filterGenres.some(genre =>
          itemGenres.includes(genre)
        );
      });
    }

    /* DIRECTOR / ARTIST FILTER */
    if (preferences.filterDirectors?.length > 0) {
      result = result.filter(item => {
        const itemDirectors = (item.director || '')
          .split(',')
          .map(d => d.trim());
        return preferences.filterDirectors.some(director =>
          itemDirectors.includes(director)
        );
      });
    }

    /* SORT */
    result.sort((a, b) => {
      let valA;
      let valB;
      switch (preferences.sortBy) {
        case 'title':
          valA = (a.title || '').toLowerCase();
          valB = (b.title || '').toLowerCase();
          return preferences.sortOrder === 'asc'
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        case 'year':
          valA = a.year || 0;
          valB = b.year || 0;
          return preferences.sortOrder === 'asc' ? valA - valB : valB - valA;
        case 'dateAdded':
        default:
          valA = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
          valB = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
          if (valA === 0 && valB === 0) return 0;
          return preferences.sortOrder === 'asc' ? valA - valB : valB - valA;
      }
    });

    setFilteredItems(result);
  }, [items, preferences, itemSearch]);

  /*
   * ----------------------------------------------------------
   * ACTIVE FILTER CHIPS
   * ----------------------------------------------------------
   */
  const renderActiveFilters = () => {
    if (!hasActiveFilters) return null;

    const chips = [];
    preferences.filterDecades.forEach(decade =>
      chips.push({ category: 'filterDecades', value: decade, label: decade })
    );
    preferences.filterGenres.forEach(genre =>
      chips.push({ category: 'filterGenres', value: genre, label: genre })
    );
    preferences.filterDirectors.forEach(director =>
      chips.push({
        category: 'filterDirectors',
        value: director,
        label: `${isMusic ? 'Art' : 'Dir'}: ${director}`,
      })
    );

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.activeFiltersContainer}
        contentContainerStyle={styles.activeFiltersContent}
      >
        {chips.map((chip, index) => (
          <TouchableOpacity
            key={`${chip.category}-${chip.value}-${index}`}
            style={styles.filterChip}
            onPress={() => toggleFilter(chip.category, chip.value)}
          >
            <Text style={styles.filterChipText}>{chip.label}</Text>
            <Ionicons
              name="close-circle"
              size={16}
              color={theme.accent}
              style={{ marginLeft: 6 }}
            />
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={styles.clearAllChip}
          onPress={() =>
            savePreferences({
              ...preferences,
              filterDecades: [],
              filterGenres: [],
              filterDirectors: [],
            })
          }
        >
          <Text style={styles.clearAllChipText}>Clear All</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  /*
   * ----------------------------------------------------------
   * GRID ITEM
   * ----------------------------------------------------------
   */
  const renderGridItem = ({ item }) => {
    // Support new coverArtUrl and legacy posterPath fallback
    const displayImage = item.coverPhoto || item.coverArtUrl || (item.posterPath ? `https://image.tmdb.org/t/p/w154${item.posterPath}` : null);

    return (
      <TouchableOpacity
        style={styles.itemCard}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('ItemDetail', { item: item, returnToCollection: true })}
      >
        <View style={styles.itemCardContent}>
          {displayImage ? (
            <Image
              source={{ uri: displayImage }}
              // Apply square dimensions for music formats
              style={[styles.itemPoster, isMusic && styles.itemPosterMusic]}
              resizeMode="cover"
            />
          ) : (
            // Apply square dimensions for music formats
            <View style={[styles.itemPosterPlaceholder, isMusic && styles.itemPosterMusic]}>
              <Ionicons name={isMusic ? "musical-notes-outline" : "videocam-outline"} size={24} color={theme.textMuted} />
            </View>
          )}
          <View style={styles.itemInfo}>
            <Text style={styles.itemTitle} numberOfLines={2}>
              {item.title || 'Unknown Title'}
            </Text>
            <Text style={styles.itemFormat}>
              {item.year ? `${item.year} • ` : ''}
              {item.format || 'Unknown Format'}
            </Text>
            {item.director ? (
              <Text style={styles.itemDirector} numberOfLines={1}>
                {isMusic ? 'Artist' : 'Dir'}: {item.director}
              </Text>
            ) : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.chevron} />
      </TouchableOpacity>
    );
  };

  /*
   * ----------------------------------------------------------
   * LIST ITEM
   * ----------------------------------------------------------
   */
  const renderListItem = ({ item }) => (
    <TouchableOpacity
      style={styles.listItemCard}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('ItemDetail', { item: item, returnToCollection: true })}
    >
      <View style={styles.listItemInfo}>
        <Text style={styles.listItemTitle} numberOfLines={1}>
          {item.title || 'Unknown Title'}
        </Text>
        <Text style={styles.listItemMeta}>
          {item.year ? `${item.year} • ` : ''}
          {item.format || 'Unknown Format'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.chevron} />
    </TouchableOpacity>
  );

  /*
   * ----------------------------------------------------------
   * CONTENT
   * ----------------------------------------------------------
   */
  const renderContent = () => {
    if (filteredItems.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="cube-outline" size={64} color={theme.emptyIcon} />
          <Text style={styles.emptyText}>
            {items.length === 0
              ? 'No items in this collection yet.'
              : itemSearch
              ? 'No items match your search.'
              : 'No items match your filters.'}
          </Text>
          <Text style={styles.emptySubtext}>
            {items.length === 0
              ? 'Tap the + button to add your first item.'
              : itemSearch
              ? 'Try adjusting your search terms.'
              : 'Try adjusting or clearing your filter settings.'}
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={filteredItems}
        renderItem={viewMode === 'grid' ? renderGridItem : renderListItem}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  /*
   * ----------------------------------------------------------
   * RENDER
   * ----------------------------------------------------------
   */
  return (
    <View style={styles.container}>
      {viewMode === '3d' ? (
        <ShelfView3D
          items={filteredItems}
          onBack={() => setViewMode('grid')}
          onViewModeChange={val => setViewMode(val)}
          onOpenFilters={() => setShowSortFilterMenu(true)}
        />
      ) : (
        <>
          {/* HEADER */}
          <View style={styles.headerInfo}>
              <View style={styles.headerRow}>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => navigation.goBack()}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="chevron-back" size={28} color={theme.textPrimary} />
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {/* VIEW MODE DROPDOWN TRIGGER */}
                  <TouchableOpacity
                    style={styles.sortFilterButton}
                    onPress={() => setShowViewMenu(true)}
                  >
                    <Ionicons name={getViewModeIcon()} size={24} color={theme.textPrimary} />
                  </TouchableOpacity>
                  {/* SORT/FILTER */}
                  <TouchableOpacity
                    style={styles.sortFilterButton}
                    onPress={() => setShowSortFilterMenu(true)}
                  >
                    <Ionicons name="options-outline" size={24} color={theme.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.collectionTitle}>
                {collection.title || 'Untitled Collection'}
              </Text>
              <Text style={styles.collectionTypes}>{type}</Text>
              {collection.details ? (
                <Text style={styles.collectionDetails}>{collection.details}</Text>
              ) : null}
          </View>

          {/* SEARCH */}
          <View style={styles.searchContainer}>
              <Ionicons
                name="search"
                size={20}
                color={theme.textMuted}
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                placeholder="Search items in this collection..."
                placeholderTextColor={theme.placeholderText}
                value={itemSearch}
                onChangeText={setItemSearch}
              />
              {itemSearch.length > 0 && (
                <TouchableOpacity
                  onPress={() => setItemSearch('')}
                  style={styles.clearSearch}
                >
                  <Ionicons name="close-circle" size={20} color={theme.textMuted} />
                </TouchableOpacity>
              )}
          </View>

          {/* ACTIVE FILTERS */}
          {renderActiveFilters()}

          {/* CONTENT */}
          {renderContent()}

          {/* FAB */}
          <TouchableOpacity
              style={styles.fab}
              onPress={() => setShowAddMenu(true)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={32} color={theme.fabIcon} />
          </TouchableOpacity>

          {/* ================================================== */}
          {/* VIEW MODE DROPDOWN */}
          {/* ================================================== */}
          {showViewMenu && (
            <>
              <TouchableWithoutFeedback onPress={() => setShowViewMenu(false)}>
                <View style={styles.dropdownBackdrop} />
              </TouchableWithoutFeedback>
              <View style={styles.viewMenu}>
                {VIEW_MODE_OPTIONS.map((option, index) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.viewMenuOption,
                      index < VIEW_MODE_OPTIONS.length - 1 &&
                        styles.viewMenuOptionBorder,
                    ]}
                    onPress={() => {
                      setViewMode(option.value);
                      setShowViewMenu(false);
                    }}
                  >
                    <Ionicons
                      name={option.icon}
                      size={20}
                      color={viewMode === option.value ? theme.accent : theme.textPrimary}
                    />
                    <Text
                      style={[
                        styles.viewMenuOptionText,
                        viewMode === option.value &&
                          styles.viewMenuOptionTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {viewMode === option.value && (
                      <Ionicons name="checkmark" size={18} color={theme.accent} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </>
      )}

      {/* ================================================== */}
      {/* ADD MENU */}
      {/* ================================================== */}
      <Modal
        visible={showAddMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowAddMenu(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.bottomSheetContainer}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>
                Add to "{collection.title}"
              </Text>

              {/* SEARCH */}
              <TouchableOpacity
                style={styles.sheetOption}
                onPress={() => {
                  setShowAddMenu(false);
                  navigation.navigate('Search', {
                    collectionId: collection.id,
                    allowedFormats: [type],
                    returnToCollection: true,
                  });
                }}
              >
                <View
                  style={[
                    styles.optionIcon,
                    { backgroundColor: theme.accentSoft },
                  ]}
                >
                  <Ionicons name="search" size={24} color={theme.accent} />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text style={styles.optionTitle}>Add by Search</Text>
                  <Text style={styles.optionSubtitle}>Search {isMusic ? 'Discogs' : 'TMDB'} by title</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.chevron} />
              </TouchableOpacity>

              {/* MANUAL */}
              <TouchableOpacity
                style={styles.sheetOption}
                onPress={() => {
                  setShowAddMenu(false);
                  navigation.navigate('AddItem', {
                    collectionId: collection.id,
                    allowedFormats: [type],
                    returnToCollection: true,
                  });
                }}
              >
                <View
                  style={[
                    styles.optionIcon,
                    { backgroundColor: theme.accentSoft },
                  ]}
                >
                  <Ionicons name="create-outline" size={24} color={theme.accent} />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text style={styles.optionTitle}>Add Manually</Text>
                  <Text style={styles.optionSubtitle}>
                    Enter all details by hand
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.chevron} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetCancel}
                onPress={() => setShowAddMenu(false)}
              >
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ================================================== */}
      {/* SORT & FILTER */}
      {/* ================================================== */}
      <Modal
        visible={showSortFilterMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSortFilterMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowSortFilterMenu(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.bottomSheetContainer}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Sort & Filter</Text>

              <ScrollView
                style={styles.sheetScroll}
                contentContainerStyle={styles.sheetScrollContent}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled={true}
              >
                <TouchableOpacity
                  style={styles.sectionTitleWrapper}
                  activeOpacity={1}
                  onPress={() => {}}
                >
                  <Text style={styles.sectionTitle}>Sort By</Text>
                </TouchableOpacity>

                {/* DATE NEWEST */}
                <TouchableOpacity
                  style={[
                    styles.filterOption,
                    preferences.sortBy === 'dateAdded' &&
                      preferences.sortOrder === 'desc' &&
                      styles.filterOptionActive,
                  ]}
                  onPress={() =>
                    savePreferences({
                      ...preferences,
                      sortBy: 'dateAdded',
                      sortOrder: 'desc',
                    })
                  }
                >
                  <Text
                    style={[
                      styles.filterOptionText,
                      preferences.sortBy === 'dateAdded' &&
                        preferences.sortOrder === 'desc' &&
                        styles.filterOptionTextActive,
                    ]}
                  >
                    Date Added (Newest First)
                  </Text>
                  {preferences.sortBy === 'dateAdded' &&
                    preferences.sortOrder === 'desc' && (
                      <Ionicons name="checkmark" size={20} color={theme.accent} />
                    )}
                </TouchableOpacity>

                {/* DATE OLDEST */}
                <TouchableOpacity
                  style={[
                    styles.filterOption,
                    preferences.sortBy === 'dateAdded' &&
                      preferences.sortOrder === 'asc' &&
                      styles.filterOptionActive,
                  ]}
                  onPress={() =>
                    savePreferences({
                      ...preferences,
                      sortBy: 'dateAdded',
                      sortOrder: 'asc',
                    })
                  }
                >
                  <Text
                    style={[
                      styles.filterOptionText,
                      preferences.sortBy === 'dateAdded' &&
                        preferences.sortOrder === 'asc' &&
                        styles.filterOptionTextActive,
                    ]}
                  >
                    Date Added (Oldest First)
                  </Text>
                  {preferences.sortBy === 'dateAdded' &&
                    preferences.sortOrder === 'asc' && (
                      <Ionicons name="checkmark" size={20} color={theme.accent} />
                    )}
                </TouchableOpacity>

                {/* TITLE A-Z */}
                <TouchableOpacity
                  style={[
                    styles.filterOption,
                    preferences.sortBy === 'title' &&
                      preferences.sortOrder === 'asc' &&
                      styles.filterOptionActive,
                  ]}
                  onPress={() =>
                    savePreferences({
                      ...preferences,
                      sortBy: 'title',
                      sortOrder: 'asc',
                    })
                  }
                >
                  <Text
                    style={[
                      styles.filterOptionText,
                      preferences.sortBy === 'title' &&
                        preferences.sortOrder === 'asc' &&
                        styles.filterOptionTextActive,
                    ]}
                  >
                    Title (A-Z)
                  </Text>
                  {preferences.sortBy === 'title' &&
                    preferences.sortOrder === 'asc' && (
                      <Ionicons name="checkmark" size={20} color={theme.accent} />
                    )}
                </TouchableOpacity>

                {/* TITLE Z-A */}
                <TouchableOpacity
                  style={[
                    styles.filterOption,
                    preferences.sortBy === 'title' &&
                      preferences.sortOrder === 'desc' &&
                      styles.filterOptionActive,
                  ]}
                  onPress={() =>
                    savePreferences({
                      ...preferences,
                      sortBy: 'title',
                      sortOrder: 'desc',
                    })
                  }
                >
                  <Text
                    style={[
                      styles.filterOptionText,
                      preferences.sortBy === 'title' &&
                        preferences.sortOrder === 'desc' &&
                        styles.filterOptionTextActive,
                    ]}
                  >
                    Title (Z-A)
                  </Text>
                  {preferences.sortBy === 'title' &&
                    preferences.sortOrder === 'desc' && (
                      <Ionicons name="checkmark" size={20} color={theme.accent} />
                    )}
                </TouchableOpacity>

                {/* YEAR NEWEST */}
                <TouchableOpacity
                  style={[
                    styles.filterOption,
                    preferences.sortBy === 'year' &&
                      preferences.sortOrder === 'desc' &&
                      styles.filterOptionActive,
                  ]}
                  onPress={() =>
                    savePreferences({
                      ...preferences,
                      sortBy: 'year',
                      sortOrder: 'desc',
                    })
                  }
                >
                  <Text
                    style={[
                      styles.filterOptionText,
                      preferences.sortBy === 'year' &&
                        preferences.sortOrder === 'desc' &&
                        styles.filterOptionTextActive,
                    ]}
                  >
                    Year (Newest First)
                  </Text>
                  {preferences.sortBy === 'year' &&
                    preferences.sortOrder === 'desc' && (
                      <Ionicons name="checkmark" size={20} color={theme.accent} />
                    )}
                </TouchableOpacity>

                {/* YEAR OLDEST */}
                <TouchableOpacity
                  style={[
                    styles.filterOption,
                    preferences.sortBy === 'year' &&
                      preferences.sortOrder === 'asc' &&
                      styles.filterOptionActive,
                  ]}
                  onPress={() =>
                    savePreferences({
                      ...preferences,
                      sortBy: 'year',
                      sortOrder: 'asc',
                    })
                  }
                >
                  <Text
                    style={[
                      styles.filterOptionText,
                      preferences.sortBy === 'year' &&
                        preferences.sortOrder === 'asc' &&
                        styles.filterOptionTextActive,
                    ]}
                  >
                    Year (Oldest First)
                  </Text>
                  {preferences.sortBy === 'year' &&
                    preferences.sortOrder === 'asc' && (
                      <Ionicons name="checkmark" size={20} color={theme.accent} />
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dividerContainer}
                  activeOpacity={1}
                  onPress={() => {}}
                >
                  <View style={styles.dividerLine} />
                </TouchableOpacity>

                {/* DECADES */}
                <TouchableOpacity
                  style={styles.sectionTitleWrapper}
                  activeOpacity={1}
                  onPress={() => {}}
                >
                  <Text style={styles.sectionTitle}>Filter by Decade</Text>
                </TouchableOpacity>
                {uniqueDecades.length > 0 ? (
                  uniqueDecades.map(decade => (
                    <TouchableOpacity
                      key={decade}
                      style={[
                        styles.filterOption,
                        (preferences.filterDecades || []).includes(decade) &&
                          styles.filterOptionActive,
                      ]}
                      onPress={() => toggleFilter('filterDecades', decade)}
                    >
                      <Text
                        style={[
                          styles.filterOptionText,
                          (preferences.filterDecades || []).includes(decade) &&
                            styles.filterOptionTextActive,
                        ]}
                      >
                        {decade}
                      </Text>
                      {(preferences.filterDecades || []).includes(decade) && (
                        <Ionicons name="checkmark" size={20} color={theme.accent} />
                      )}
                    </TouchableOpacity>
                  ))
                ) : (
                  <TouchableOpacity
                    style={styles.sectionTitleWrapper}
                    activeOpacity={1}
                    onPress={() => {}}
                  >
                    <Text style={styles.emptyFilterText}>
                      No decades available yet.
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.dividerContainer}
                  activeOpacity={1}
                  onPress={() => {}}
                >
                  <View style={styles.dividerLine} />
                </TouchableOpacity>

                {/* GENRES */}
                <TouchableOpacity
                  style={styles.sectionTitleWrapper}
                  activeOpacity={1}
                  onPress={() => {}}
                >
                  <Text style={styles.sectionTitle}>Filter by Genre</Text>
                </TouchableOpacity>
                {uniqueGenres.length > 0 ? (
                  uniqueGenres.map(genre => (
                    <TouchableOpacity
                      key={genre}
                      style={[
                        styles.filterOption,
                        (preferences.filterGenres || []).includes(genre) &&
                          styles.filterOptionActive,
                      ]}
                      onPress={() => toggleFilter('filterGenres', genre)}
                    >
                      <Text
                        style={[
                          styles.filterOptionText,
                          (preferences.filterGenres || []).includes(genre) &&
                            styles.filterOptionTextActive,
                        ]}
                      >
                        {genre}
                      </Text>
                      {(preferences.filterGenres || []).includes(genre) && (
                        <Ionicons name="checkmark" size={20} color={theme.accent} />
                      )}
                    </TouchableOpacity>
                  ))
                ) : (
                  <TouchableOpacity
                    style={styles.sectionTitleWrapper}
                    activeOpacity={1}
                    onPress={() => {}}
                  >
                    <Text style={styles.emptyFilterText}>
                      No genres available yet.
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.dividerContainer}
                  activeOpacity={1}
                  onPress={() => {}}
                >
                  <View style={styles.dividerLine} />
                </TouchableOpacity>

                {/* DIRECTORS / ARTISTS */}
                <TouchableOpacity
                  style={styles.sectionTitleWrapper}
                  activeOpacity={1}
                  onPress={() => {}}
                >
                  <Text style={styles.sectionTitle}>Filter by {isMusic ? 'Artist' : 'Director'}</Text>
                </TouchableOpacity>
                {uniqueDirectors.length > 0 ? (
                  uniqueDirectors.map(director => (
                    <TouchableOpacity
                      key={director}
                      style={[
                        styles.filterOption,
                        (preferences.filterDirectors || []).includes(
                          director
                        ) && styles.filterOptionActive,
                      ]}
                      onPress={() => toggleFilter('filterDirectors', director)}
                    >
                      <Text
                        style={[
                          styles.filterOptionText,
                          (preferences.filterDirectors || []).includes(
                            director
                          ) && styles.filterOptionTextActive,
                        ]}
                      >
                        {director}
                      </Text>
                      {(preferences.filterDirectors || []).includes(
                        director
                      ) && (
                        <Ionicons name="checkmark" size={20} color={theme.accent} />
                      )}
                    </TouchableOpacity>
                  ))
                ) : (
                  <TouchableOpacity
                    style={styles.sectionTitleWrapper}
                    activeOpacity={1}
                    onPress={() => {}}
                  >
                    <Text style={styles.emptyFilterText}>
                      No {isMusic ? 'artists' : 'directors'} available yet.
                    </Text>
                  </TouchableOpacity>
                )}

                <View style={{ height: 10 }} />
              </ScrollView>

              <TouchableOpacity
                style={styles.sheetCancel}
                onPress={() => setShowSortFilterMenu(false)}
              >
                <Text style={styles.sheetCancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

/*
 * ------------------------------------------------------------
 * STYLES
 * ------------------------------------------------------------
 */
const getStyles = (theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  headerInfo: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: theme.headerBackground,
    borderBottomWidth: 1,
    borderBottomColor: theme.headerBorder,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortFilterButton: {
    padding: 8,
    backgroundColor: theme.chipBackground,
    borderRadius: 8,
  },
  collectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.headerTitle,
    marginBottom: 4,
  },
  collectionTypes: {
    fontSize: 14,
    color: theme.typeText,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  collectionDetails: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  /* SEARCH */
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.inputBackground,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.inputBorder,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: theme.inputText,
    fontSize: 15,
    paddingVertical: 10,
  },
  clearSearch: {
    padding: 4,
  },
  /* ACTIVE FILTERS */
  activeFiltersContainer: {
    maxHeight: 50,
    backgroundColor: theme.headerBackground,
    borderBottomWidth: 1,
    borderBottomColor: theme.headerBorder,
  },
  activeFiltersContent: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.chipBackground,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.accent,
  },
  filterChipText: {
    color: theme.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  clearAllChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: theme.accentSoft,
  },
  clearAllChipText: {
    color: theme.accent,
    fontSize: 13,
    fontWeight: 'bold',
  },
  /* VIEW MODE DROPDOWN */
  dropdownBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    zIndex: 998,
    elevation: 998,
  },
  viewMenu: {
    position: 'absolute',
    top: 108,
    right: 20,
    minWidth: 170,
    backgroundColor: theme.sheetBackground,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.sheetBorder,
    overflow: 'hidden',
    zIndex: 999,
    elevation: 999,
  },
  viewMenuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  viewMenuOptionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.sheetBorder,
  },
  viewMenuOptionText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: theme.textPrimary,
  },
  viewMenuOptionTextActive: {
    color: theme.accent,
    fontWeight: '600',
  },
  /* LIST */
  list: {
    padding: 16,
  },
  /* GRID */
  itemCard: {
    backgroundColor: theme.cardBackground,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  itemCardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemPoster: {
    width: 50,
    height: 75,
    borderRadius: 6,
    marginRight: 12,
    backgroundColor: theme.chipBackground,
  },
  itemPosterMusic: {
    width: 60,
    height: 60, // Square aspect ratio for albums
  },
  itemPosterPlaceholder: {
    width: 50,
    height: 75,
    borderRadius: 6,
    marginRight: 12,
    backgroundColor: theme.chipBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemInfo: {
    flex: 1,
    paddingRight: 8,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.titleText,
    marginBottom: 4,
  },
  itemFormat: {
    fontSize: 13,
    color: theme.textSecondary,
    marginBottom: 4,
  },
  itemDirector: {
    fontSize: 12,
    color: theme.textMuted,
    fontStyle: 'italic',
  },
  /* LIST VIEW */
  listItemCard: {
    backgroundColor: theme.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  listItemInfo: {
    flex: 1,
    paddingRight: 8,
  },
  listItemTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.titleText,
    marginBottom: 4,
  },
  listItemMeta: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  /* EMPTY */
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.textFaint,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
  },
  /* FAB */
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.fabBackground,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 8,
  },
  /* MODALS */
  modalBackdrop: {
    flex: 1,
    backgroundColor: theme.backdrop,
    justifyContent: 'flex-end',
  },
  bottomSheetContainer: {
    backgroundColor: theme.sheetBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: theme.sheetBorder,
    maxHeight: height * 0.85,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: theme.sheetHandle,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 15,
    marginBottom: 10,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
    marginHorizontal: 20,
  },
  sheetScroll: {
    maxHeight: height * 0.65,
  },
  sheetScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.sheetBorder,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  optionSubtitle: {
    fontSize: 13,
    color: theme.textMuted,
  },
  sheetCancel: {
    marginHorizontal: 20,
    marginBottom: 20,
    marginTop: 10,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: theme.chipBackground,
    borderRadius: 12,
  },
  sheetCancelText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.textPrimary,
  },
  /* SORT/FILTER */
  sectionTitleWrapper: {
    paddingVertical: 8,
    backgroundColor: theme.sheetBackground,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.textMuted,
    marginTop: 8,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: theme.sheetBorder,
  },
  filterOptionActive: {
    backgroundColor: theme.accentSoft,
    borderBottomColor: theme.accent,
  },
  filterOptionText: {
    fontSize: 16,
    color: theme.textPrimary,
  },
  filterOptionTextActive: {
    color: theme.textPrimary,
    fontWeight: '600',
  },
  dividerContainer: {
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.sheetBackground,
  },
  dividerLine: {
    height: 1,
    width: '100%',
    backgroundColor: theme.sheetBorder,
  },
  emptyFilterText: {
    color: theme.textFaint,
    fontSize: 14,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
});