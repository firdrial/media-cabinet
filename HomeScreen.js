import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  TouchableWithoutFeedback,
  Alert, 
  Modal,
  ScrollView,
  Dimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadItems as loadStoredItems } from './mediaStorage';
import { getTheme, DEFAULT_THEME_ID, THEME_OPTIONS } from './theme';

const { height } = Dimensions.get('window');

// ---------------------------------------------------------
// STORAGE KEYS & MIGRATION CONSTANTS
// ---------------------------------------------------------
const PREFS_KEY = 'media_cabinet_preferences';
const LEGACY_PREFS_KEY = 'vhs_tracker_preferences';

const COLLECTIONS_KEY = 'media_collections';
const LEGACY_COLLECTIONS_KEY = 'vhs_collections';

const DEFAULT_PREFERENCES = {
  sortBy: 'dateAdded',
  sortOrder: 'desc',
  filterDecades: [],
  filterGenres: [],
  filterDirectors: [],
  theme: DEFAULT_THEME_ID
};

// Standardized 'LaserDisc' to match mediaModels.js FORMAT_DEFAULT_MODEL
const COLLECTION_TYPES = ['CD', 'VHS', 'DVD', 'Blu-Ray', 'LaserDisc', 'Vinyl Record'];

const getIconForType = (type) => {
  switch (type) {
    case 'CD': return 'disc';
    case 'VHS': return 'film';
    case 'DVD': return 'play-circle';
    case 'Blu-Ray': return 'videocam';
    case 'LaserDisc': return 'tv'; // Updated capitalization
    case 'Vinyl Record': return 'musical-notes';
    default: return 'folder';
  }
};

export default function HomeScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [collections, setCollections] = useState([]);
  const [filteredCollections, setFilteredCollections] = useState([]);
  const [collectionSearch, setCollectionSearch] = useState('');
  
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showSortFilterMenu, setShowSortFilterMenu] = useState(false);
  const [showAddCollection, setShowAddCollection] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);

  const [collType, setCollType] = useState('VHS');
  const [collTitle, setCollTitle] = useState('My Media Collection');
  const [collDetails, setCollDetails] = useState('');
  const [collTags, setCollTags] = useState('');
  const [editingCollectionId, setEditingCollectionId] = useState(null);

  // Load current theme and generate dynamic styles
  const theme = getTheme(preferences.theme);
  const styles = getStyles(theme);

  const loadPreferences = async () => {
    try {
      let prefsJSON = await AsyncStorage.getItem(PREFS_KEY);
      
      // Migration: Check for legacy preferences key
      if (!prefsJSON) {
        const legacyPrefsJSON = await AsyncStorage.getItem(LEGACY_PREFS_KEY);
        if (legacyPrefsJSON) {
          await AsyncStorage.setItem(PREFS_KEY, legacyPrefsJSON);
          await AsyncStorage.removeItem(LEGACY_PREFS_KEY);
          prefsJSON = legacyPrefsJSON;
        }
      }

      if (prefsJSON) {
        const parsed = JSON.parse(prefsJSON);
        setPreferences({
          ...DEFAULT_PREFERENCES,
          ...parsed,
          filterDecades: parsed.filterDecades || [],
          filterGenres: parsed.filterGenres || [],
          filterDirectors: parsed.filterDirectors || []
        });
      }
    } catch (error) {
      console.error('Failed to load preferences', error);
    }
  };

  const savePreferences = async (newPrefs) => {
    try {
      setPreferences(newPrefs);
      await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(newPrefs));
    } catch (error) {
      Alert.alert('Error', 'Failed to save preferences');
    }
  };

  const handleSelectTheme = (themeId) => {
    savePreferences({ ...preferences, theme: themeId });
    setShowThemePicker(false);
  };

  const loadItems = async () => {
    try {
      setItems(await loadStoredItems());
    } catch (error) {
      console.error('Failed to load items', error);
      Alert.alert('Error', 'Failed to load collection');
    }
  };

  const loadCollections = async () => {
    try {
      let collectionsJSON = await AsyncStorage.getItem(COLLECTIONS_KEY);
      
      // Migration: Check for legacy collections key
      if (!collectionsJSON) {
        const legacyCollectionsJSON = await AsyncStorage.getItem(LEGACY_COLLECTIONS_KEY);
        if (legacyCollectionsJSON) {
          await AsyncStorage.setItem(COLLECTIONS_KEY, legacyCollectionsJSON);
          await AsyncStorage.removeItem(LEGACY_COLLECTIONS_KEY);
          collectionsJSON = legacyCollectionsJSON;
        }
      }

      if (collectionsJSON) {
        setCollections(JSON.parse(collectionsJSON));
      } else {
        setCollections([]);
      }
    } catch (error) {
      console.error('Failed to load collections', error);
    }
  };

  useEffect(() => {
    const init = async () => {
      await loadPreferences();
      await loadItems();
      await loadCollections();
    };
    init();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadItems();
      loadCollections();
      loadPreferences();
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (!collectionSearch) {
      setFilteredCollections(collections);
    } else {
      const lowerSearch = collectionSearch.toLowerCase();
      const filtered = collections.filter(c => {
        const type = c.type || c.allowedTypes?.[0] || '';
        const tags = c.tags || [];
        
        return (
          (c.title || '').toLowerCase().includes(lowerSearch) ||
          type.toLowerCase().includes(lowerSearch) ||
          tags.some(t => (t || '').toLowerCase().includes(lowerSearch))
        );
      });
      setFilteredCollections(filtered);
    }
  }, [collections, collectionSearch]);

  const selectType = (type) => {
    const oldType = collType;
    setCollType(type);
    if (collTitle === `My ${oldType} Collection` || collTitle === 'My Mixed Collection' || collTitle === 'My Collection' || collTitle === 'My Media Collection') {
      setCollTitle(`My ${type} Collection`);
    }
  };

  const openEditModal = (collection) => {
    const type = collection.type || collection.allowedTypes?.[0] || 'VHS';
    setCollType(type);
    setCollTitle(collection.title || '');
    setCollDetails(collection.details || '');
    setCollTags((collection.tags || []).join(', '));
    setEditingCollectionId(collection.id);
    setShowAddCollection(true);
  };

  const resetAndCloseCollectionModal = () => {
    setCollType('VHS');
    setCollTitle('My Media Collection');
    setCollDetails('');
    setCollTags('');
    setEditingCollectionId(null);
    setShowAddCollection(false);
  };

  const saveCollection = () => {
    const title = collTitle.trim();
    if (!title) {
      Alert.alert('Error', 'Please enter a collection title.');
      return;
    }

    if (editingCollectionId) {
      const updated = collections.map(c => {
        if (c.id === editingCollectionId) {
          return {
            ...c,
            type: collType,
            title: title,
            details: collDetails,
            tags: collTags.split(',').map(t => t.trim()).filter(Boolean)
          };
        }
        return c;
      });
      setCollections(updated);
      AsyncStorage.setItem(COLLECTIONS_KEY, JSON.stringify(updated));
      resetAndCloseCollectionModal();
      return;
    }

    const existingIndex = collections.findIndex(c => (c.title || '').toLowerCase() === title.toLowerCase());

    if (existingIndex !== -1) {
      Alert.alert(
        'Collection Exists',
        `A collection named "${title}" already exists.`,
        [
          {
            text: 'Overwrite',
            onPress: () => {
              const updated = [...collections];
              updated[existingIndex] = {
                ...updated[existingIndex],
                type: collType,
                details: collDetails,
                tags: collTags.split(',').map(t => t.trim()).filter(Boolean)
              };
              setCollections(updated);
              AsyncStorage.setItem(COLLECTIONS_KEY, JSON.stringify(updated));
              resetAndCloseCollectionModal();
            }
          },
          {
            text: 'Save as Duplicate',
            onPress: () => {
              let newTitle = title;
              let counter = 2;
              const match = title.match(/^(.*)\s\((\d+)\)$/);
              const baseName = match ? match[1] : title;
              
              while (collections.some(c => (c.title || '').toLowerCase() === newTitle.toLowerCase())) {
                newTitle = `${baseName} (${counter})`;
                counter++;
              }
              
              const newCollection = {
                id: Date.now().toString(),
                type: collType,
                title: newTitle,
                details: collDetails,
                tags: collTags.split(',').map(t => t.trim()).filter(Boolean),
                createdAt: new Date().toISOString()
              };
              const updated = [...collections, newCollection];
              setCollections(updated);
              AsyncStorage.setItem(COLLECTIONS_KEY, JSON.stringify(updated));
              resetAndCloseCollectionModal();
            }
          },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    } else {
      const newCollection = {
        id: Date.now().toString(),
        type: collType,
        title: title,
        details: collDetails,
        tags: collTags.split(',').map(t => t.trim()).filter(Boolean),
        createdAt: new Date().toISOString()
      };
      const updated = [...collections, newCollection];
      setCollections(updated);
      AsyncStorage.setItem(COLLECTIONS_KEY, JSON.stringify(updated));
      resetAndCloseCollectionModal();
    }
  };

  const handleDeleteCollection = (collectionToDelete) => {
    Alert.alert(
      'Delete Collection',
      `Are you sure you want to delete "${collectionToDelete.title}"? This will not delete the items inside it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const updated = collections.filter(c => c.id !== collectionToDelete.id);
            setCollections(updated);
            AsyncStorage.setItem(COLLECTIONS_KEY, JSON.stringify(updated));
          }
        }
      ]
    );
  };

  const renderCollection = ({ item }) => {
    const type = item.type || item.allowedTypes?.[0] || 'Unknown';
    const tags = item.tags || [];

    return (
      <TouchableOpacity 
        style={styles.collectionCard}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('CollectionDetail', { collection: item })}
        onLongPress={() => {
          Alert.alert(
            item.title || 'Untitled',
            'What would you like to do?',
            [
              { text: 'Edit', onPress: () => openEditModal(item) },
              { text: 'Delete', style: 'destructive', onPress: () => handleDeleteCollection(item) },
              { text: 'Cancel', style: 'cancel' }
            ]
          );
        }}
      >
        <View style={styles.collectionIcon}>
          <Ionicons name={getIconForType(type)} size={24} color={theme.iconColor} />
        </View>
        <View style={styles.collectionInfo}>
          <Text style={styles.collectionTitle} numberOfLines={1}>{item.title || 'Untitled'}</Text>
          <Text style={styles.collectionType}>{type}</Text>
          {item.details ? <Text style={styles.collectionDetails} numberOfLines={1}>{item.details}</Text> : null}
          {tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {tags.slice(0, 3).map((tag, idx) => (
                <Text key={idx} style={styles.tagChip}>{tag}</Text>
              ))}
              {tags.length > 3 && <Text style={styles.tagChip}>+{tags.length - 3}</Text>}
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.chevron} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>My Collections</Text>
            <Text style={styles.headerCount}>
              {filteredCollections.length} {filteredCollections.length === 1 ? 'collection' : 'collections'}
              {collectionSearch ? ' (Filtered)' : ''}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={styles.themeButton}
              onPress={() => setShowThemePicker(true)}
            >
              <Ionicons name="color-palette-outline" size={24} color={theme.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.sortFilterButton}
              onPress={() => setShowSortFilterMenu(true)}
            >
              <Ionicons name="options-outline" size={24} color={theme.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={theme.textMuted} style={styles.searchIcon} />
        <TextInput 
          style={styles.searchInput}
          placeholder="Search collections by title..."
          placeholderTextColor={theme.placeholderText}
          value={collectionSearch}
          onChangeText={setCollectionSearch}
        />
        {collectionSearch.length > 0 && (
          <TouchableOpacity onPress={() => setCollectionSearch('')} style={styles.clearSearch}>
            <Ionicons name="close-circle" size={20} color={theme.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {filteredCollections.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="albums-outline" size={64} color={theme.emptyIcon} />
          <Text style={styles.emptyText}>
            {collections.length === 0 ? 'No collections yet!' : 'No collections match your search.'}
          </Text>
          <Text style={styles.emptySubtext}>
            {collections.length === 0 ? 'Tap the + button to add your first collection.' : 'Try adjusting your search terms.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredCollections}
          renderItem={renderCollection}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <TouchableOpacity 
        style={styles.fab}
        onPress={() => setShowAddMenu(true)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={32} color={theme.fabIcon} />
      </TouchableOpacity>

      {/* Add Menu Bottom Sheet Modal (Collections Only) */}
      <Modal
        visible={showAddMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAddMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowAddMenu(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.bottomSheetContainer}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Add to App</Text>

              <TouchableOpacity 
                style={styles.sheetOption} 
                onPress={() => {
                  setShowAddMenu(false);
                  resetAndCloseCollectionModal();
                  setTimeout(() => setShowAddCollection(true), 100);
                }}
              >
                <View style={[styles.optionIcon, { backgroundColor: theme.accentSoft }]}>
                  <Ionicons name="albums-outline" size={24} color={theme.accent} />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text style={styles.optionTitle}>Add a Collection</Text>
                  <Text style={styles.optionSubtitle}>Create a new media collection</Text>
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

      {/* Add/Edit Collection Modal */}
      <Modal
        visible={showAddCollection}
        transparent={true}
        animationType="slide"
        onRequestClose={() => resetAndCloseCollectionModal()}
      >
        <KeyboardAvoidingView 
          style={{ flex: 1, backgroundColor: theme.backdrop, justifyContent: 'flex-end' }} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableWithoutFeedback onPress={() => resetAndCloseCollectionModal()}>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={styles.bottomSheetContainer}>
                  <View style={styles.sheetHandle} />
                  <Text style={styles.sheetTitle}>
                    {editingCollectionId ? 'Edit Collection' : 'Add a Collection'}
                  </Text>
                  <ScrollView 
                    style={styles.sheetScroll} 
                    contentContainerStyle={styles.sheetScrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  >
                    
                    <Text style={styles.inputLabel}>Select Media Type</Text>
                    <View style={styles.typeGrid}>
                      {COLLECTION_TYPES.map(type => (
                        <TouchableOpacity 
                          key={type} 
                          style={[styles.typeChip, collType === type && styles.typeChipActive]}
                          onPress={() => selectType(type)}
                        >
                          <Text style={[styles.typeChipText, collType === type && styles.typeChipTextActive]}>{type}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={styles.inputLabel}>Title</Text>
                    <TextInput 
                      style={styles.input} 
                      value={collTitle} 
                      onChangeText={setCollTitle} 
                      placeholder="e.g., My Media Collection"
                      placeholderTextColor={theme.placeholderText}
                    />

                    <Text style={styles.inputLabel}>Details (Optional)</Text>
                    <TextInput 
                      style={[styles.input, styles.textArea]} 
                      value={collDetails} 
                      onChangeText={setCollDetails} 
                      placeholder="Any additional details..."
                      placeholderTextColor={theme.placeholderText}
                      multiline
                      numberOfLines={3}
                    />

                    <Text style={styles.inputLabel}>Tags (comma separated)</Text>
                    <TextInput 
                      style={styles.input} 
                      value={collTags} 
                      onChangeText={setCollTags} 
                      placeholder="e.g., 80s, Horror, Rare"
                      placeholderTextColor={theme.placeholderText}
                    />

                    <TouchableOpacity style={styles.saveButton} onPress={saveCollection}>
                      <Text style={styles.saveButtonText}>
                        {editingCollectionId ? 'Save Changes' : 'Save Collection'}
                      </Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={styles.sheetCancel} onPress={resetAndCloseCollectionModal}>
                      <Text style={styles.sheetCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    
                    <View style={{ height: 100 }} />
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* Sort & Filter Bottom Sheet Modal */}
      <Modal
        visible={showSortFilterMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSortFilterMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowSortFilterMenu(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.bottomSheetContainer}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Sort & Filter</Text>
              <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetScrollContent}>
                <Text style={styles.emptyFilterText}>Sort and filter options apply to individual items within collections. (Collection-level sorting coming soon!)</Text>
                <TouchableOpacity style={styles.sheetCancel} onPress={() => setShowSortFilterMenu(false)}>
                  <Text style={styles.sheetCancelText}>Close</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Theme Picker Bottom Sheet Modal */}
      <Modal
        visible={showThemePicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowThemePicker(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowThemePicker(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.bottomSheetContainer}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Choose Theme</Text>
              <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetScrollContent}>
                {THEME_OPTIONS.map((opt) => (
                  <TouchableOpacity 
                    key={opt.id} 
                    style={styles.themePickerRow}
                    onPress={() => handleSelectTheme(opt.id)}
                  >
                    {preferences.theme === opt.id ? (
                      <Ionicons name="checkmark-circle" size={24} color={theme.accent} style={styles.themePickerSelectedIcon} />
                    ) : (
                      <Ionicons name="ellipse-outline" size={24} color={theme.textMuted} style={styles.themePickerSelectedIcon} />
                    )}
                    <Text style={styles.themePickerLabel}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.sheetCancel} onPress={() => setShowThemePicker(false)}>
                  <Text style={styles.sheetCancelText}>Close</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const getStyles = (theme) => ({
  container: { flex: 1, backgroundColor: theme.background },
  header: { padding: 20, paddingTop: 60, backgroundColor: theme.headerBackground, borderBottomWidth: 1, borderBottomColor: theme.headerBorder },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexShrink: 1 },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: theme.headerTitle },
  headerCount: { fontSize: 15, color: theme.headerSub, marginTop: 4 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    color: theme.inputText,
    fontSize: 15,
    paddingVertical: 10,
  },
  clearSearch: { padding: 4 },
  list: { padding: 16 },
  collectionCard: { 
    backgroundColor: theme.cardBackground, 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 12, 
    flexDirection: 'row', 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: theme.cardBorder 
  },
  collectionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  collectionInfo: { flex: 1 },
  collectionTitle: { fontSize: 16, fontWeight: 'bold', color: theme.titleText, marginBottom: 4 },
  collectionType: { fontSize: 13, color: theme.typeText, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase' },
  collectionDetails: { fontSize: 13, color: theme.detailsText, marginBottom: 6 },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  tagChip: {
    fontSize: 11,
    color: theme.chipText,
    backgroundColor: theme.chipBackground,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 4,
  },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 20, fontWeight: 'bold', color: theme.textFaint, marginTop: 16, marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: theme.textMuted, textAlign: 'center' },
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
    elevation: 8 
  },
  modalBackdrop: { 
    flex: 1, 
    backgroundColor: theme.backdrop, 
    justifyContent: 'flex-end' 
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
    marginBottom: 10
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
    borderBottomColor: theme.sheetBorder
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16
  },
  optionTextContainer: { flex: 1 },
  optionTitle: { fontSize: 16, fontWeight: '600', color: theme.textPrimary, marginBottom: 4 },
  optionSubtitle: { fontSize: 13, color: theme.textMuted },
  sheetCancel: {
    marginHorizontal: 20,
    marginBottom: 20,
    marginTop: 10,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: theme.chipBackground,
    borderRadius: 12
  },
  sheetCancelText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.textPrimary
  },
  sortFilterButton: {
    padding: 8,
    backgroundColor: theme.chipBackground,
    borderRadius: 8,
  },
  themeButton: {
    padding: 8,
    backgroundColor: theme.chipBackground,
    borderRadius: 8,
  },
  themePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.sheetBorder,
  },
  themePickerSelectedIcon: {
    marginRight: 12,
  },
  themePickerLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: theme.inputBackground,
    color: theme.inputText,
    fontSize: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.inputBorder,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  typeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: theme.chipBackground,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.chipBorder,
  },
  typeChipActive: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accent,
  },
  typeChipText: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  typeChipTextActive: {
    color: theme.accent,
  },
  saveButton: {
    backgroundColor: theme.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonText: {
    color: theme.onAccent,
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyFilterText: {
    color: theme.textFaint,
    fontSize: 14,
    fontStyle: 'italic',
    paddingVertical: 8,
    textAlign: 'center',
  }
});