import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  StyleSheet, 
  TouchableOpacity, 
  Alert, 
  Image,
  Modal,
  TouchableWithoutFeedback
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveTape, loadTapes } from './tapeStorage';
import { useFocusEffect, usePreventRemove } from '@react-navigation/native';
import { searchMovieByBarcode, getFullMovieDetails } from './apiService';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import Tape3DPreview from './Tape3DPreview';
import { warpQuad } from './modules/quad-detect';
import { resolveModelId, getModel, getCaseTypes, getScanLabel } from './mediaModels';

export default function AddTapeScreen({ route, navigation }) {
  const isEdit = !!route.params?.tape;
  const existingTape = route.params?.tape;
  
  const collectionId = route.params?.collectionId || null;
  const allowedFormats = route.params?.allowedFormats || null;
  const returnToCollection = route.params?.returnToCollection || false;

  const [title, setTitle] = useState(existingTape?.title || '');
  const [year, setYear] = useState(existingTape?.year || '');
  const [format, setFormat] = useState(existingTape?.format || (allowedFormats ? allowedFormats[0] : 'VHS'));
  const [caseType, setCaseType] = useState(existingTape?.caseType || 'slipcase');
  const [notes, setNotes] = useState(existingTape?.notes || '');
  const [barcode, setBarcode] = useState(existingTape?.barcode || '');
  const [tmdbId, setTmdbId] = useState(existingTape?.tmdbId || '');
  const [posterPath, setPosterPath] = useState(existingTape?.posterPath || '');
  const [coverPhoto, setCoverPhoto] = useState(existingTape?.coverPhoto || null);
  const [textureMap, setTextureMap] = useState(existingTape?.textureMap || null);
  const [showCoverOptions, setShowCoverOptions] = useState(false);
  
  const [releaseDate, setReleaseDate] = useState(existingTape?.releaseDate || '');
  const [runtime, setRuntime] = useState(existingTape?.runtime || '');
  const [distributor, setDistributor] = useState(existingTape?.distributor || '');
  const [edition, setEdition] = useState(existingTape?.edition || '');
  const [tagline, setTagline] = useState(existingTape?.tagline || '');
  const [overview, setOverview] = useState(existingTape?.overview || '');
  const [genres, setGenres] = useState(existingTape?.genres ? existingTape.genres.join(', ') : '');
  const [budget, setBudget] = useState(existingTape?.budget || '');
  const [revenue, setRevenue] = useState(existingTape?.revenue || '');
  const [productionCompanies, setProductionCompanies] = useState(existingTape?.productionCompanies ? existingTape.productionCompanies.join(', ') : '');
  const [director, setDirector] = useState(existingTape?.director || '');
  const [writer, setWriter] = useState(existingTape?.writer || '');

  const modelId = resolveModelId(format, caseType);

  // Track unsaved changes
  const [isDirty, setIsDirty] = useState(false);
  
  // Ref to bypass preventRemove alert during active save operations
  const isSavingRef = useRef(false);

  const handleChange = (setter) => (value) => {
    setter(value);
    setIsDirty(prev => prev ? prev : true);
  };

  const handleFormatChange = (fmt) => {
    setFormat(fmt);
    const types = getCaseTypes(fmt);
    if (types && !types.find(t => t.id === caseType)) {
      setCaseType(types[0].id);
    } else if (!types) {
      setCaseType('slipcase');
    }
    setIsDirty(prev => prev ? prev : true);
  };

  // Prevent user from leaving if there are unsaved changes
  usePreventRemove(isDirty, ({ data }) => {
    // If we are actively saving, bypass the warning and let the navigation proceed
    if (isSavingRef.current) {
      navigation.dispatch(data.action);
      return;
    }

    Alert.alert(
      'Discard changes?',
      'You have unsaved changes. Are you sure you want to discard them and go back?',
      [
        { text: "Don't leave", style: 'cancel', onPress: () => {} },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            isSavingRef.current = true;
            navigation.dispatch(data.action);
          },
        },
      ]
    );
  });

  useEffect(() => {
    const fetchData = async () => {
      if (isEdit) return;

      if (route.params?.barcode) {
        setBarcode(route.params.barcode);
        setTitle('Searching database...');
        try {
          const movieData = await searchMovieByBarcode(route.params.barcode);
          if (movieData && movieData.found) {
            setTitle(movieData.title);
            setYear(movieData.year);
            setTmdbId(movieData.id);
            setPosterPath(movieData.poster_path);
            
            const details = await getFullMovieDetails(movieData.id);
            if (details) {
              setReleaseDate(details.releaseDate);
              setRuntime(details.runtime);
              setDistributor(details.distributor);
              setTagline(details.tagline);
              setOverview(details.overview);
              setGenres(details.genres.join(', '));
              setBudget(details.budget);
              setRevenue(details.revenue);
              setProductionCompanies(details.productionCompanies.join(', '));
              setDirector(details.director);
              setWriter(details.writer);
            }
            setIsDirty(prev => prev ? prev : true);
          } else {
            setTitle('');
            Alert.alert('Not Found', 'No movie found for this barcode. You can enter the details manually.');
          }
        } catch (error) {
          console.error('CRASH IN USE EFFECT:', error);
          Alert.alert('Error', 'The app crashed while searching.');
        }
      } 
      else if (route.params?.searchResult) {
        const movie = route.params.searchResult;
        setTitle(movie.title);
        setYear(movie.year);
        setTmdbId(movie.id);
        setPosterPath(movie.poster_path);
        
        const details = await getFullMovieDetails(movie.id);
        if (details) {
          setReleaseDate(details.releaseDate);
          setRuntime(details.runtime);
          setDistributor(details.distributor);
          setTagline(details.tagline);
          setOverview(details.overview);
          setGenres(details.genres.join(', '));
          setBudget(details.budget);
          setRevenue(details.revenue);
          setProductionCompanies(details.productionCompanies.join(', '));
          setDirector(details.director);
          setWriter(details.writer);
        }
        setIsDirty(prev => prev ? prev : true);
      } 
    };

    fetchData();
  }, [route.params?.barcode, route.params?.searchResult, isEdit]);

  useFocusEffect(
    useCallback(() => {
      const fetchPending = async () => {
        try {
          const pendingJSON = await AsyncStorage.getItem('pending_texture_map');
          if (pendingJSON) {
            setTextureMap(JSON.parse(pendingJSON));
            setIsDirty(prev => prev ? prev : true);
            await AsyncStorage.removeItem('pending_texture_map');
          }
        } catch (e) {
          console.error('Failed to load pending texture map', e);
        }
      };
      fetchPending();
    }, [])
  );

  const handlePickFromGallery = async () => {
    setShowCoverOptions(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [ImagePicker.MediaType.Images],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.7,
    });

    if (!result.canceled) {
      setCoverPhoto(result.assets[0].uri);
      setIsDirty(prev => prev ? prev : true);
    }
  };

  const handleTakePhoto = async () => {
    setShowCoverOptions(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your camera.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.7,
    });

    if (!result.canceled) {
      setCoverPhoto(result.assets[0].uri);
      setIsDirty(prev => prev ? prev : true);
    }
  };

  const handleUse3DScan = async () => {
    setShowCoverOptions(false);
    if (textureMap?.front) {
      try {
        const activeModelId = textureMap.modelId || modelId;
        const model = getModel(activeModelId);
        const [outW, outH] = model.faces.front.out;

        // Extract and rectify the front cover using the native warp module
        const result = await warpQuad(textureMap.front.uri, textureMap.front.corners, outW, outH, false);
        if (result && result.uri) {
          setCoverPhoto(result.uri);
          setIsDirty(prev => prev ? prev : true);
        } else {
          Alert.alert('Error', 'Could not extract front cover.');
        }
      } catch (e) {
        console.error('Failed to warp 3D scan front cover', e);
        Alert.alert('Error', 'Failed to extract front cover.');
      }
    }
  };

  const handleClearCover = () => {
    setShowCoverOptions(false);
    setCoverPhoto(null);
    setIsDirty(prev => prev ? prev : true);
  };

  const performSave = async () => {
    const tapeData = {
      id: existingTape?.id || Date.now().toString(),
      collectionId: collectionId || existingTape?.collectionId || null,
      title,
      year,
      format,
      caseType,
      modelId,
      notes,
      barcode,
      tmdbId,
      posterPath,
      coverPhoto,
      textureMap,
      releaseDate,
      runtime,
      distributor,
      edition,
      tagline,
      overview,
      genres: genres.split(',').map(g => g.trim()).filter(g => g),
      budget,
      revenue,
      productionCompanies: productionCompanies.split(',').map(p => p.trim()).filter(p => p),
      director,
      writer,
      dateAdded: existingTape?.dateAdded || new Date().toISOString(), 
    };

    try {
      await saveTape(tapeData);
      
      // Mark as saving to bypass the usePreventRemove alert
      isSavingRef.current = true;
      setIsDirty(false); // Clear dirty state to allow navigation away
      
      Alert.alert('Success!', `"${title}" has been saved!`);
      
      navigation.replace('TapeDetail', { tape: tapeData, returnToCollection });
      
    } catch (error) {
      isSavingRef.current = false; // Reset on failure
      console.error('Save error:', error);
      Alert.alert('Error', 'Failed to save the item.');
    }
  };

  const handleSave = async () => {
    if (!title || title === 'Searching database...') {
      Alert.alert('Oops', 'Please wait for the search to finish or enter a title!');
      return;
    }

    try {
      const allTapes = await loadTapes();
      const targetCollectionId = collectionId || existingTape?.collectionId || null;
      
      const duplicate = allTapes.find(tape => {
        // Skip the current tape if we are editing
        if (isEdit && tape.id === existingTape.id) return false;
        
        // Must be in the same collection
        const tapeCollectionId = tape.collectionId || null;
        if (targetCollectionId !== tapeCollectionId) return false;
        
        // Check identifiers
        if (tmdbId && tape.tmdbId && String(tape.tmdbId) === String(tmdbId)) return true;
        if (barcode && tape.barcode && tape.barcode === barcode) return true;
        if (title && year && tape.title === title && String(tape.year) === String(year)) return true;
        if (title && !year && tape.title === title) return true;
        
        return false;
      });

      if (duplicate) {
        Alert.alert(
          'Duplicate Item',
          `"${duplicate.title}" already exists in this collection. Do you want to add it anyway?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Add Anyway', onPress: performSave }
          ]
        );
        return;
      }
    } catch (e) {
      console.error('Duplicate check error:', e);
    }

    performSave();
  };

  const currentCaseTypes = getCaseTypes(format);

  return (
    <>
      <KeyboardAwareScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        extraScrollHeight={20}
        keyboardOpeningTime={0}
      >
        <Text style={styles.header}>{isEdit ? 'Edit Item' : 'Add New Item'}</Text>

        {collectionId && allowedFormats && (
          <View style={styles.collectionBanner}>
            <Text style={styles.collectionBannerText}>
              Adding to collection ({allowedFormats.join(' • ')})
            </Text>
          </View>
        )}

        {posterPath ? (
          <Image 
            source={{ uri: `https://image.tmdb.org/t/p/w342${posterPath}` }} 
            style={styles.posterPreview} 
            resizeMode="cover"
          />
        ) : null}

        <Text style={styles.sectionHeader}>Basic Info</Text>
        <Text style={styles.label}>Title</Text>
        <TextInput style={styles.input} placeholder="e.g., The Matrix" value={title} onChangeText={handleChange(setTitle)} />

        <Text style={styles.label}>Release Year</Text>
        <TextInput style={styles.input} placeholder="e.g., 1999" keyboardType="numeric" value={year} onChangeText={handleChange(setYear)} />

        <Text style={styles.label}>Format</Text>
        {allowedFormats ? (
          <View style={styles.formatChipsContainer}>
            {allowedFormats.map((fmt) => (
              <TouchableOpacity
                key={fmt}
                style={[styles.formatChip, format === fmt && styles.formatChipActive]}
                onPress={() => handleFormatChange(fmt)}
              >
                <Text style={[styles.formatChipText, format === fmt && styles.formatChipTextActive]}>{fmt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <TextInput style={styles.input} placeholder="e.g., VHS, DVD, Betamax" value={format} onChangeText={(val) => {
             setFormat(val);
             const types = getCaseTypes(val);
             if (types && !types.find(t => t.id === caseType)) setCaseType(types[0].id);
             setIsDirty(prev => prev ? prev : true);
          }} />
        )}

        {currentCaseTypes && (
          <>
            <Text style={styles.label}>Case Type</Text>
            <View style={styles.formatChipsContainer}>
              {currentCaseTypes.map((ct) => (
                <TouchableOpacity
                  key={ct.id}
                  style={[styles.formatChip, caseType === ct.id && styles.formatChipActive]}
                  onPress={() => {
                    setCaseType(ct.id);
                    setIsDirty(prev => prev ? prev : true);
                  }}
                >
                  <Text style={[styles.formatChipText, caseType === ct.id && styles.formatChipTextActive]}>{ct.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <Text style={styles.label}>Edition</Text>
        <TextInput style={styles.input} placeholder="e.g., Collector's Edition" value={edition} onChangeText={handleChange(setEdition)} />

        <Text style={styles.sectionHeader}>TMDB Details</Text>
        <Text style={styles.label}>Release Date</Text>
        <TextInput style={styles.input} placeholder="e.g., 1999-10-15" value={releaseDate} onChangeText={handleChange(setReleaseDate)} />

        <Text style={styles.label}>Runtime</Text>
        <TextInput style={styles.input} placeholder="e.g., 136 min" value={runtime} onChangeText={handleChange(setRuntime)} />

        <Text style={styles.label}>Distributor</Text>
        <TextInput style={styles.input} placeholder="e.g., Warner Bros." value={distributor} onChangeText={handleChange(setDistributor)} />

        <Text style={styles.label}>Tagline</Text>
        <TextInput style={styles.input} placeholder="e.g., Welcome to the Real World" value={tagline} onChangeText={handleChange(setTagline)} />

        <Text style={styles.label}>Genres (comma separated)</Text>
        <TextInput style={styles.input} placeholder="e.g., Action, Sci-Fi" value={genres} onChangeText={handleChange(setGenres)} />

        <Text style={styles.label}>Director</Text>
        <TextInput style={styles.input} placeholder="e.g., The Wachowskis" value={director} onChangeText={handleChange(setDirector)} />

        <Text style={styles.label}>Writer</Text>
        <TextInput style={styles.input} placeholder="e.g., The Wachowskis" value={writer} onChangeText={handleChange(setWriter)} />

        <Text style={styles.label}>Budget</Text>
        <TextInput style={styles.input} placeholder="e.g., $63,000,000" value={budget} onChangeText={handleChange(setBudget)} />

        <Text style={styles.label}>Revenue</Text>
        <TextInput style={styles.input} placeholder="e.g., $463,500,000" value={revenue} onChangeText={handleChange(setRevenue)} />

        <Text style={styles.label}>Production Companies (comma separated)</Text>
        <TextInput style={styles.input} placeholder="e.g., Warner Bros., Village Roadshow" value={productionCompanies} onChangeText={handleChange(setProductionCompanies)} />

        <Text style={styles.label}>Plot Overview</Text>
        <TextInput 
          style={[styles.input, styles.multiline]} 
          placeholder="Enter plot summary..." 
          multiline 
          numberOfLines={4}
          value={overview} 
          onChangeText={handleChange(setOverview)} 
        />

        <Text style={styles.label}>Notes / Condition</Text>
        <TextInput 
          style={[styles.input, styles.multiline]} 
          placeholder="Any scratches? Special features?" 
          multiline 
          value={notes} 
          onChangeText={handleChange(setNotes)} 
        />

        {barcode ? (
          <View style={styles.barcodeContainer}>
            <Text style={styles.label}>Scanned Barcode</Text>
            <View style={styles.barcodeBox}>
              <Text style={styles.barcodeText}>{barcode}</Text>
            </View>
          </View>
        ) : null}

        <Text style={styles.label}>Cover Photo</Text>
        <TouchableOpacity 
          style={styles.photoUploader} 
          onPress={() => setShowCoverOptions(true)}
          activeOpacity={0.7}
        >
          {coverPhoto ? (
            <Image source={{ uri: coverPhoto }} style={styles.coverPhotoPreview} resizeMode="cover" />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="image-outline" size={32} color="#666666" />
              <Text style={styles.photoPlaceholderText}>Tap to choose cover photo</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.scan3DButton} 
          onPress={() => navigation.navigate('ReelScan', { returnTo: 'AddTape', modelId })}
        >
          <Ionicons name="cube-outline" size={24} color="#e07a5f" />
          <Text style={styles.scan3DButtonText}>
            {getScanLabel(modelId, !!textureMap)}
          </Text>
        </TouchableOpacity>
        
        {textureMap && (
          <>
            <Text style={styles.scanStatus}>
              <Ionicons name="checkmark-circle" size={16} color="#4CAF50" /> 3D scan captured!
            </Text>
            <Tape3DPreview textureMap={textureMap} modelId={textureMap?.modelId || modelId} />
          </>
        )}

        <TouchableOpacity style={styles.button} onPress={handleSave}>
          <Text style={styles.buttonText}>{isEdit ? 'Update Item' : 'Save to Collection'}</Text>
        </TouchableOpacity>
        
        <View style={{ height: 60 }} />
      </KeyboardAwareScrollView>

      <Modal
        visible={showCoverOptions}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCoverOptions(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowCoverOptions(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.bottomSheetContainer}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Choose Cover Photo</Text>
              
              <TouchableOpacity style={styles.sheetOption} onPress={handlePickFromGallery}>
                <View style={[styles.optionIcon, { backgroundColor: 'rgba(0, 168, 255, 0.15)' }]}>
                  <Ionicons name="image-outline" size={24} color="#00a8ff" />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text style={styles.optionTitle}>Upload from Gallery</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetOption} onPress={handleTakePhoto}>
                <View style={[styles.optionIcon, { backgroundColor: 'rgba(76, 175, 80, 0.15)' }]}>
                  <Ionicons name="camera-outline" size={24} color="#4CAF50" />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text style={styles.optionTitle}>Take Photo</Text>
                </View>
              </TouchableOpacity>

              {textureMap?.front && (
                <TouchableOpacity style={styles.sheetOption} onPress={handleUse3DScan}>
                  <View style={[styles.optionIcon, { backgroundColor: 'rgba(224, 122, 95, 0.15)' }]}>
                    <Ionicons name="cube-outline" size={24} color="#e07a5f" />
                  </View>
                  <View style={styles.optionTextContainer}>
                    <Text style={styles.optionTitle}>Use 3D Scan Front Cover</Text>
                  </View>
                </TouchableOpacity>
              )}

              {coverPhoto && (
                <TouchableOpacity style={styles.sheetOption} onPress={handleClearCover}>
                  <View style={[styles.optionIcon, { backgroundColor: 'rgba(229, 9, 20, 0.15)' }]}>
                    <Ionicons name="trash-outline" size={24} color="#e50914" />
                  </View>
                  <View style={styles.optionTextContainer}>
                    <Text style={styles.optionTitle}>Revert to TMDB Default</Text>
                  </View>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.sheetCancel} onPress={() => setShowCoverOptions(false)}>
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  scrollContent: { padding: 20, paddingTop: 60 }, 
  header: { fontSize: 32, fontWeight: 'bold', color: '#ffffff', marginBottom: 20, textAlign: 'center' },
  collectionBanner: {
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.3)',
  },
  collectionBannerText: {
    color: '#e50914',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeader: { fontSize: 20, fontWeight: 'bold', color: '#e50914', marginTop: 20, marginBottom: 10 },
  posterPreview: { width: 150, height: 225, borderRadius: 8, alignSelf: 'center', marginBottom: 20, backgroundColor: '#333333' },
  label: { fontSize: 14, color: '#aaaaaa', marginBottom: 5, marginTop: 15 },
  input: { backgroundColor: '#1e1e1e', borderColor: '#333333', borderWidth: 1, borderRadius: 8, padding: 15, fontSize: 16, color: '#ffffff' },
  multiline: { height: 100, textAlignVertical: 'top' },
  button: { backgroundColor: '#e50914', padding: 18, borderRadius: 8, marginTop: 30, alignItems: 'center' },
  buttonText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  barcodeContainer: { marginTop: 20 },
  barcodeBox: { backgroundColor: '#2a2a2a', padding: 15, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#e50914' },
  barcodeText: { color: '#ffffff', fontSize: 16, fontFamily: 'monospace' },
  photoUploader: {
    width: '100%',
    height: 200,
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333333',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 5,
    overflow: 'hidden',
  },
  coverPhotoPreview: { width: '100%', height: '100%' },
  photoPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  photoPlaceholderText: { color: '#666666', fontSize: 14, marginTop: 8, fontWeight: '600' },
  formatChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  formatChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#2a2a2a',
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333333',
  },
  formatChipActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    borderColor: '#e50914',
  },
  formatChipText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  formatChipTextActive: {
    color: '#e50914',
  },
  scan3DButton: {
    flexDirection: 'row',
    backgroundColor: '#2a2a2a',
    padding: 18,
    borderRadius: 8,
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e07a5f',
    gap: 10,
  },
  scan3DButtonText: {
    color: '#e07a5f',
    fontSize: 18,
    fontWeight: 'bold',
  },
  scanStatus: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
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
  optionTitle: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
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
  }
});