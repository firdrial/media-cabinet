import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  StyleSheet, 
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
import { loadTapes as loadStoredTapes } from './tapeStorage';

const { height } = Dimensions.get('window');

const DEFAULT_PREFERENCES = {
  sortBy: 'dateAdded',
  sortOrder: 'desc',
  filterDecades: [],
  filterGenres: [],
  filterDirectors: []
};

const COLLECTION_TYPES = ['CD', 'Cassette Tape', 'VHS', 'DVD', 'Blu-Ray', 'Laserdisc', 'Video Game'];

const getIconForType = (type) => {
  switch (type) {
    case 'CD': return 'disc';
    case 'Cassette Tape': return 'radio';
    case 'VHS': return 'videocam';
    case 'DVD': return 'disc';
    case 'Blu-Ray': return 'disc';
    case 'Laserdisc': return 'disc';
    case 'Video Game': return 'game-controller';
    default: return 'folder';
  }
};

export default function HomeScreen({ navigation }) {
  const [tapes, setTapes] = useState([]);
  const [collections, setCollections] = useState([]);
  const [filteredCollections, setFilteredCollections] = useState([]);
  const [collectionSearch, setCollectionSearch] = useState('');
  
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showSortFilterMenu, setShowSortFilterMenu] = useState(false);
  const [showAddCollection, setShowAddCollection] = useState(false);
  
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);

  const [collType, setCollType] = useState('VHS');
  const [collTitle, setCollTitle] = useState('My VHS Collection');
  const [collDetails, setCollDetails] = useState('');
  const [collTags, setCollTags] = useState('');
  const [editingCollectionId, setEditingCollectionId] = useState(null);

  const loadPreferences = async () => {
    try {
      const prefsJSON = await AsyncStorage.getItem('vhs_tracker_preferences');
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
      await AsyncStorage.setItem('vhs_tracker_preferences', JSON.stringify(newPrefs));
    } catch (error) {
      Alert.alert('Error', 'Failed to save preferences');
    }
  };

  const loadTapes = async () => {
    try {
      setTapes(await loadStoredTapes());
    } catch (error) {
      console.error('Failed to load tapes', error);
      Alert.alert('Error', 'Failed to load collection');
    }
  };


  const loadCollections = async () => {
    try {
      const collectionsJSON = await AsyncStorage.getItem('vhs_collections');
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
      await loadTapes();
      await loadCollections();
    };
    init();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadTapes();
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
    if (collTitle === `My ${oldType} Collection` || collTitle === 'My Mixed Collection' || collTitle === 'My Collection') {
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
    setCollTitle('My VHS Collection');
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
      AsyncStorage.setItem('vhs_collections', JSON.stringify(updated));
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
              AsyncStorage.setItem('vhs_collections', JSON.stringify(updated));
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
              AsyncStorage.setItem('vhs_collections', JSON.stringify(updated));
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
      AsyncStorage.setItem('vhs_collections', JSON.stringify(updated));
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
            AsyncStorage.setItem('vhs_collections', JSON.stringify(updated));
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
          <Ionicons name={getIconForType(type)} size={24} color="#e50914" />
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
        <Ionicons name="chevron-forward" size={20} color="#666666" />
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
              style={styles.sortFilterButton}
              onPress={() => setShowSortFilterMenu(true)}
            >
              <Ionicons name="options-outline" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#888888" style={styles.searchIcon} />
        <TextInput 
          style={styles.searchInput}
          placeholder="Search collections by title..."
          placeholderTextColor="#666666"
          value={collectionSearch}
          onChangeText={setCollectionSearch}
        />
        {collectionSearch.length > 0 && (
          <TouchableOpacity onPress={() => setCollectionSearch('')} style={styles.clearSearch}>
            <Ionicons name="close-circle" size={20} color="#888888" />
          </TouchableOpacity>
        )}
      </View>

      {filteredCollections.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="albums-outline" size={64} color="#333333" />
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
        <Ionicons name="add" size={32} color="#ffffff" />
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
                <View style={[styles.optionIcon, { backgroundColor: 'rgba(156, 39, 176, 0.15)' }]}>
                  <Ionicons name="albums-outline" size={24} color="#9C27B0" />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text style={styles.optionTitle}>Add a Collection</Text>
                  <Text style={styles.optionSubtitle}>Create a new media collection</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#666666" />
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
          style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'flex-end' }} 
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
                      placeholder="e.g., My VHS Collection"
                      placeholderTextColor="#666"
                    />

                    <Text style={styles.inputLabel}>Details (Optional)</Text>
                    <TextInput 
                      style={[styles.input, styles.textArea]} 
                      value={collDetails} 
                      onChangeText={setCollDetails} 
                      placeholder="Any additional details..."
                      placeholderTextColor="#666"
                      multiline
                      numberOfLines={3}
                    />

                    <Text style={styles.inputLabel}>Tags (comma separated)</Text>
                    <TextInput 
                      style={styles.input} 
                      value={collTags} 
                      onChangeText={setCollTags} 
                      placeholder="e.g., 80s, Horror, Rare"
                      placeholderTextColor="#666"
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: { padding: 20, paddingTop: 60, backgroundColor: '#1a1a1a', borderBottomWidth: 1, borderBottomColor: '#333333' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexShrink: 1 },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#ffffff' },
  headerCount: { fontSize: 15, color: '#888888', marginTop: 4 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
    paddingVertical: 10,
  },
  clearSearch: { padding: 4 },
  list: { padding: 16 },
  collectionCard: { 
    backgroundColor: '#1e1e1e', 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 12, 
    flexDirection: 'row', 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: '#333333' 
  },
  collectionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  collectionInfo: { flex: 1 },
  collectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#ffffff', marginBottom: 4 },
  collectionType: { fontSize: 13, color: '#e50914', fontWeight: '600', marginBottom: 4, textTransform: 'uppercase' },
  collectionDetails: { fontSize: 13, color: '#aaaaaa', marginBottom: 6 },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  tagChip: {
    fontSize: 11,
    color: '#888888',
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 4,
  },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 20, fontWeight: 'bold', color: '#666666', marginTop: 16, marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#444444', textAlign: 'center' },
  fab: { 
    position: 'absolute', 
    bottom: 30, 
    right: 30, 
    width: 64, 
    height: 64, 
    borderRadius: 32, 
    backgroundColor: '#e50914', 
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
    backgroundColor: 'rgba(0, 0, 0, 0.6)', 
    justifyContent: 'flex-end' 
  },
  bottomSheetContainer: { 
    backgroundColor: '#1e1e1e', 
    borderTopLeftRadius: 24, 
    borderTopRightRadius: 24, 
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#333333',
    maxHeight: height * 0.85,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#444444',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 15,
    marginBottom: 10
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
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
    borderBottomColor: '#333333'
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
  optionTitle: { fontSize: 16, fontWeight: '600', color: '#ffffff', marginBottom: 4 },
  optionSubtitle: { fontSize: 13, color: '#888888' },
  sheetCancel: {
    marginHorizontal: 20,
    marginBottom: 20,
    marginTop: 10,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 12
  },
  sheetCancelText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff'
  },
  sortFilterButton: {
    padding: 8,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#aaaaaa',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#2a2a2a',
    color: '#ffffff',
    fontSize: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333333',
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
    backgroundColor: '#2a2a2a',
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333333',
  },
  typeChipActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    borderColor: '#e50914',
  },
  typeChipText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  typeChipTextActive: {
    color: '#e50914',
  },
  saveButton: {
    backgroundColor: '#e50914',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyFilterText: {
    color: '#666666',
    fontSize: 14,
    fontStyle: 'italic',
    paddingVertical: 8,
    textAlign: 'center',
  }
});
