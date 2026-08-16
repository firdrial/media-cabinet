import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  Alert, 
  Image,
  Modal,
  TouchableWithoutFeedback
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveItem, loadItems } from './mediaStorage';
import { useFocusEffect, usePreventRemove } from '@react-navigation/native';
import { getFullMovieDetails } from './tmdbService';
import { getFullAlbumDetails } from './musicService';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import Media3DPreview from './Media3DPreview';
import { warpQuad } from './modules/quad-detect';
import { 
  resolveModelId, 
  getModel, 
  getCaseTypes, 
  getScanLabel, 
  getCategory, 
  MEDIA_CATEGORIES 
} from './mediaModels';
import { getTheme, DEFAULT_THEME_ID } from './theme';

export default function ItemFormScreen({ route, navigation }) {
  const isEdit = !!route.params?.item;
  const existingItem = route.params?.item;
  
  const collectionId = route.params?.collectionId || null;
  const allowedFormats = route.params?.allowedFormats || null;
  const returnToCollection = route.params?.returnToCollection || false;

  const [preferences, setPreferences] = useState({ theme: DEFAULT_THEME_ID });

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

  const [title, setTitle] = useState(existingItem?.title || '');
  const [year, setYear] = useState(existingItem?.year || '');
  const [format, setFormat] = useState(existingItem?.format || (allowedFormats ? allowedFormats[0] : 'VHS'));
  const [caseType, setCaseType] = useState(existingItem?.caseType || 'slipcase');
  const [notes, setNotes] = useState(existingItem?.notes || '');
  
  // Standardized API fields (replaces tmdbId/posterPath)
  const [externalId, setExternalId] = useState(existingItem?.externalId || existingItem?.tmdbId || '');
  const [apiSource, setApiSource] = useState(existingItem?.apiSource || '');
  const [coverArtUrl, setCoverArtUrl] = useState(() => {
    if (existingItem?.coverArtUrl) return existingItem.coverArtUrl;
    if (existingItem?.posterPath) return `https://image.tmdb.org/t/p/w342${existingItem.posterPath}`;
    return null;
  });

  const [coverPhoto, setCoverPhoto] = useState(existingItem?.coverPhoto || null);
  const [textureMap, setTextureMap] = useState(existingItem?.textureMap || null);
  const [showCoverOptions, setShowCoverOptions] = useState(false);
  
  const [releaseDate, setReleaseDate] = useState(existingItem?.releaseDate || '');
  const [runtime, setRuntime] = useState(existingItem?.runtime || '');
  const [distributor, setDistributor] = useState(existingItem?.distributor || '');
  const [edition, setEdition] = useState(existingItem?.edition || '');
  const [tagline, setTagline] = useState(existingItem?.tagline || '');
  const [overview, setOverview] = useState(existingItem?.overview || '');
  const [genres, setGenres] = useState(existingItem?.genres ? existingItem.genres.join(', ') : '');
  const [budget, setBudget] = useState(existingItem?.budget || '');
  const [revenue, setRevenue] = useState(existingItem?.revenue || '');
  const [productionCompanies, setProductionCompanies] = useState(existingItem?.productionCompanies ? existingItem.productionCompanies.join(', ') : '');
  const [director, setDirector] = useState(existingItem?.director || '');
  const [writer, setWriter] = useState(existingItem?.writer || '');

  // Music-specific state
  const [tracklist, setTracklist] = useState(existingItem?.tracklist || []);
  const [tracklistStyle, setTracklistStyle] = useState(existingItem?.tracklistStyle || '');
  
  // NEW: State to hold both API tracklists for dynamic swapping based on format
  const [sequentialTracklist, setSequentialTracklist] = useState([]);
  const [sidesTracklist, setSidesTracklist] = useState(null);
  
  const [mediaFormats, setMediaFormats] = useState(existingItem?.mediaFormats || []);
  const [country, setCountry] = useState(existingItem?.country || '');

  const modelId = resolveModelId(format, caseType);
  const category = getCategory(modelId);
  const isMusic = category === MEDIA_CATEGORIES.MUSIC;

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

      if (route.params?.searchResult) {
        const result = route.params.searchResult;
        setTitle(result.title);
        setYear(result.year);
        setExternalId(result.id);
        setApiSource(result.source);
        
        // Set initial cover art (thumbnail from search)
        setCoverArtUrl(result.coverArtUrl || null);
        
        let details = null;
        if (result.source === 'TMDB') {
          details = await getFullMovieDetails(result.id);
        } else if (result.source === 'Discogs' || result.source === 'Spotify') {
          details = await getFullAlbumDetails(result.id);
        }
        
        if (details) {
          if (details.coverArtUrl) {
            setCoverArtUrl(details.coverArtUrl);
          }
          
          if (details.title) {
            setTitle(details.title);
          }

          setReleaseDate(details.releaseDate);
          setRuntime(details.runtime);
          setDistributor(details.distributor);
          setTagline(details.tagline);
          setOverview(details.overview);
          setGenres(details.genres.join(', '));
          setBudget(details.budget || '');
          setRevenue(details.revenue || '');
          setProductionCompanies(details.productionCompanies.join(', '));
          setDirector(details.director);
          setWriter(details.writer);
          
          if (details.source === 'Discogs' || details.source === 'Spotify') {
            // NEW: Store both tracklists from the API
            setSequentialTracklist(details.tracklist || []);
            setSidesTracklist(details.sidesTracklist || null);
            setMediaFormats(details.formats || []);
            setCountry(details.country || '');
          }
        }
        setIsDirty(prev => prev ? prev : true);
      } 
    };

    fetchData();
  }, [route.params?.searchResult, isEdit]);

  // NEW: Dynamically swap the tracklist based on the selected physical format
  useEffect(() => {
    if (!isMusic) return;

    const formatLower = (format || '').toLowerCase();
    const isSideBased = formatLower.includes('vinyl') || formatLower.includes('cassette');

    if (isSideBased && sidesTracklist && sidesTracklist.length > 0) {
      setTracklist(sidesTracklist);
      setTracklistStyle('sides');
    } else if (sequentialTracklist && sequentialTracklist.length > 0) {
      setTracklist(sequentialTracklist);
      setTracklistStyle('sequential');
    }
  }, [format, sequentialTracklist, sidesTracklist, isMusic]);

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
    const itemData = {
      id: existingItem?.id || Date.now().toString(),
      collectionId: collectionId || existingItem?.collectionId || null,
      title,
      year,
      format,
      caseType,
      modelId,
      category,
      notes,
      externalId,
      apiSource,
      coverArtUrl,
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
      tracklist,
      tracklistStyle: tracklistStyle || getModel(modelId).tracklistStyle,
      mediaFormats,
      country,
      dateAdded: existingItem?.dateAdded || new Date().toISOString(), 
    };

    try {
      await saveItem(itemData);
      
      isSavingRef.current = true;
      setIsDirty(false); 
      
      Alert.alert('Success!', `"${title}" has been saved!`);
      navigation.replace('ItemDetail', { item: itemData, returnToCollection });
      
    } catch (error) {
      isSavingRef.current = false;
      console.error('Save error:', error);
      Alert.alert('Error', 'Failed to save the item.');
    }
  };

  const handleSave = async () => {
    if (!title) {
      Alert.alert('Oops', 'Please enter a title!');
      return;
    }

    try {
      const allItems = await loadItems();
      const targetCollectionId = collectionId || existingItem?.collectionId || null;
      
      const duplicate = allItems.find(item => {
        if (isEdit && item.id === existingItem.id) return false;
        
        const itemCollectionId = item.collectionId || null;
        if (targetCollectionId !== itemCollectionId) return false;
        
        if (externalId && item.externalId && String(item.externalId) === String(externalId)) return true;
        if (externalId && item.tmdbId && String(item.tmdbId) === String(externalId)) return true; // Legacy check
        if (title && year && item.title === title && String(item.year) === String(year)) return true;
        if (title && !year && item.title === title) return true;
        
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

  const renderTracklist = () => {
    if (!isMusic || tracklist.length === 0) return null;

    const currentStyle = tracklistStyle || getModel(modelId).tracklistStyle || 'sequential';

    if (currentStyle === 'sides') {
      let currentSide = null;
      const groupedTracks = [];

      tracklist.forEach((track, index) => {
        // Extract the side letter (e.g., 'A' from 'A1', 'B' from 'B1')
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
          <Text style={styles.label}>Tracklist</Text>
          <View style={styles.tracklistContainer}>
            {groupedTracks}
          </View>
        </>
      );
    }

    // Sequential (CDs, etc)
    return (
      <>
        <Text style={styles.label}>Tracklist</Text>
        <View style={styles.tracklistContainer}>
          {tracklist.map((track, index) => (
            <View key={index} style={styles.trackRow}>
              <Text style={styles.trackPosition}>{track.position || `${index + 1}`}</Text>
              <Text style={styles.trackTitle}>{track.title}</Text>
              <Text style={styles.trackDuration}>{track.duration || ''}</Text>
            </View>
          ))}
        </View>
      </>
    );
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

        {coverArtUrl ? (
          <Image 
            source={{ uri: coverArtUrl }} 
            style={[styles.posterPreview, isMusic && styles.posterPreviewMusic]} 
            resizeMode="cover"
          />
        ) : null}

        <Text style={styles.sectionHeader}>Basic Info</Text>
        <Text style={styles.label}>Title</Text>
        <TextInput style={styles.input} placeholder="e.g., The Matrix" placeholderTextColor={theme.placeholderText} value={title} onChangeText={handleChange(setTitle)} />

        <Text style={styles.label}>Release Year</Text>
        <TextInput style={styles.input} placeholder="e.g., 1999" placeholderTextColor={theme.placeholderText} keyboardType="numeric" value={year} onChangeText={handleChange(setYear)} />

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
          <TextInput style={styles.input} placeholder="e.g., VHS, CD, Vinyl" placeholderTextColor={theme.placeholderText} value={format} onChangeText={(val) => {
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
        <TextInput style={styles.input} placeholder="e.g., Collector's Edition" placeholderTextColor={theme.placeholderText} value={edition} onChangeText={handleChange(setEdition)} />

        <Text style={styles.sectionHeader}>
          {isMusic ? 'Music Details' : 'TMDB Details'}
        </Text>
        
        <Text style={styles.label}>Release Date</Text>
        <TextInput style={styles.input} placeholder="e.g., 1999-10-15" placeholderTextColor={theme.placeholderText} value={releaseDate} onChangeText={handleChange(setReleaseDate)} />

        <Text style={styles.label}>Runtime</Text>
        <TextInput style={styles.input} placeholder={isMusic ? "e.g., 45:30" : "e.g., 136 min"} placeholderTextColor={theme.placeholderText} value={runtime} onChangeText={handleChange(setRuntime)} />

        <Text style={styles.label}>{isMusic ? 'Record Label(s)' : 'Distributor'}</Text>
        <TextInput style={styles.input} placeholder={isMusic ? "e.g., RCA, Sub Pop" : "e.g., Warner Bros."} placeholderTextColor={theme.placeholderText} value={distributor} onChangeText={handleChange(setDistributor)} />

        <Text style={styles.label}>{isMusic ? 'Catalog #' : 'Tagline'}</Text>
        <TextInput style={styles.input} placeholder={isMusic ? "e.g., PB 41447" : "e.g., Welcome to the Real World"} placeholderTextColor={theme.placeholderText} value={tagline} onChangeText={handleChange(setTagline)} />

        <Text style={styles.label}>Genres (comma separated)</Text>
        <TextInput style={styles.input} placeholder={isMusic ? "e.g., Rock, Grunge, Synth-pop" : "e.g., Action, Sci-Fi"} placeholderTextColor={theme.placeholderText} value={genres} onChangeText={handleChange(setGenres)} />

        <Text style={styles.label}>{isMusic ? 'Artist(s)' : 'Director'}</Text>
        <TextInput style={styles.input} placeholder={isMusic ? "e.g., Nirvana" : "e.g., The Wachowskis"} placeholderTextColor={theme.placeholderText} value={director} onChangeText={handleChange(setDirector)} />

        <Text style={styles.label}>{isMusic ? 'Producer(s) / Writer(s)' : 'Writer'}</Text>
        <TextInput style={styles.input} placeholder={isMusic ? "e.g., Butch Vig" : "e.g., The Wachowskis"} placeholderTextColor={theme.placeholderText} value={writer} onChangeText={handleChange(setWriter)} />

        {!isMusic && (
          <>
            <Text style={styles.label}>Budget</Text>
            <TextInput style={styles.input} placeholder="e.g., $63,000,000" placeholderTextColor={theme.placeholderText} value={budget} onChangeText={handleChange(setBudget)} />

            <Text style={styles.label}>Revenue</Text>
            <TextInput style={styles.input} placeholder="e.g., $463,500,000" placeholderTextColor={theme.placeholderText} value={revenue} onChangeText={handleChange(setRevenue)} />
          </>
        )}

        <Text style={styles.label}>{isMusic ? 'Label(s) / Production' : 'Production Companies (comma separated)'}</Text>
        <TextInput style={styles.input} placeholder="e.g., Warner Bros., Village Roadshow" placeholderTextColor={theme.placeholderText} value={productionCompanies} onChangeText={handleChange(setProductionCompanies)} />

        <Text style={styles.label}>{isMusic ? 'Release Notes' : 'Plot Overview'}</Text>
        <TextInput 
          style={[styles.input, styles.multiline]} 
          placeholder={isMusic ? "Notes on pressing, matrix runout, etc..." : "Enter plot summary..."} 
          placeholderTextColor={theme.placeholderText}
          multiline 
          numberOfLines={4}
          value={overview} 
          onChangeText={handleChange(setOverview)} 
        />

        <Text style={styles.label}>Notes / Condition</Text>
        <TextInput 
          style={[styles.input, styles.multiline]} 
          placeholder="Any scratches? Special features?" 
          placeholderTextColor={theme.placeholderText}
          multiline 
          value={notes} 
          onChangeText={handleChange(setNotes)} 
        />

        {isMusic && mediaFormats.length > 0 && (
          <>
            <Text style={styles.label}>Format(s)</Text>
            <View style={styles.formatChipsContainer}>
              {mediaFormats.map((fmt, index) => (
                <View key={index} style={styles.formatChip}>
                  <Text style={styles.formatChipText}>{fmt}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {renderTracklist()}

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
              <Ionicons name="image-outline" size={32} color={theme.textMuted} />
              <Text style={styles.photoPlaceholderText}>Tap to choose cover photo</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.scan3DButton} 
          onPress={() => navigation.navigate('MediaScan', { returnTo: 'AddItem', modelId })}
        >
          <Ionicons name="cube-outline" size={24} color={theme.accent} />
          <Text style={styles.scan3DButtonText}>
            {getScanLabel(modelId, !!textureMap)}
          </Text>
        </TouchableOpacity>
        
        {textureMap && (
          <>
            <Text style={styles.scanStatus}>
              <Ionicons name="checkmark-circle" size={16} color={theme.accent} /> 3D scan captured!
            </Text>
            <Media3DPreview textureMap={textureMap} modelId={textureMap?.modelId || modelId} />
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
                <View style={[styles.optionIcon, { backgroundColor: theme.accentSoft }]}>
                  <Ionicons name="image-outline" size={24} color={theme.accent} />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text style={styles.optionTitle}>Upload from Gallery</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetOption} onPress={handleTakePhoto}>
                <View style={[styles.optionIcon, { backgroundColor: theme.accentSoft }]}>
                  <Ionicons name="camera-outline" size={24} color={theme.accent} />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text style={styles.optionTitle}>Take Photo</Text>
                </View>
              </TouchableOpacity>

              {textureMap?.front && (
                <TouchableOpacity style={styles.sheetOption} onPress={handleUse3DScan}>
                  <View style={[styles.optionIcon, { backgroundColor: theme.accentSoft }]}>
                    <Ionicons name="cube-outline" size={24} color={theme.accent} />
                  </View>
                  <View style={styles.optionTextContainer}>
                    <Text style={styles.optionTitle}>Use 3D Scan Front Cover</Text>
                  </View>
                </TouchableOpacity>
              )}

              {coverPhoto && coverArtUrl && (
                <TouchableOpacity style={styles.sheetOption} onPress={handleClearCover}>
                  <View style={[styles.optionIcon, { backgroundColor: theme.accentSoft }]}>
                    <Ionicons name="trash-outline" size={24} color={theme.accent} />
                  </View>
                  <View style={styles.optionTextContainer}>
                    <Text style={styles.optionTitle}>
                      Revert to Default Artwork
                    </Text>
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

const getStyles = (theme) => ({
  container: { flex: 1, backgroundColor: theme.background },
  scrollContent: { padding: 20, paddingTop: 60 }, 
  header: { fontSize: 32, fontWeight: 'bold', color: theme.textPrimary, marginBottom: 20, textAlign: 'center' },
  collectionBanner: {
    backgroundColor: theme.accentSoft,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.accent,
  },
  collectionBannerText: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeader: { fontSize: 20, fontWeight: 'bold', color: theme.accent, marginTop: 20, marginBottom: 10 },
  posterPreview: { width: 150, height: 225, borderRadius: 8, alignSelf: 'center', marginBottom: 20, backgroundColor: theme.chipBackground },
  posterPreviewMusic: { width: 150, height: 150 },
  label: { fontSize: 14, color: theme.textSecondary, marginBottom: 5, marginTop: 15 },
  input: { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder, borderWidth: 1, borderRadius: 8, padding: 15, fontSize: 16, color: theme.inputText },
  multiline: { height: 100, textAlignVertical: 'top' },
  button: { backgroundColor: theme.accent, padding: 18, borderRadius: 8, marginTop: 30, alignItems: 'center' },
  buttonText: { color: theme.onAccent, fontSize: 18, fontWeight: 'bold' },
  photoUploader: {
    width: '100%',
    height: 200,
    backgroundColor: theme.cardBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 5,
    overflow: 'hidden',
  },
  coverPhotoPreview: { width: '100%', height: '100%' },
  photoPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  photoPlaceholderText: { color: theme.textMuted, fontSize: 14, marginTop: 8, fontWeight: '600' },
  formatChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  formatChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: theme.chipBackground,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.chipBorder,
  },
  formatChipActive: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accent,
  },
  formatChipText: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  formatChipTextActive: {
    color: theme.accent,
  },
  tracklistContainer: {
    backgroundColor: theme.cardBackground,
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
  scan3DButton: {
    flexDirection: 'row',
    backgroundColor: theme.chipBackground,
    padding: 18,
    borderRadius: 8,
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.accent,
    gap: 10,
  },
  scan3DButtonText: {
    color: theme.accent,
    fontSize: 18,
    fontWeight: 'bold',
  },
  scanStatus: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
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
  optionTitle: { fontSize: 16, fontWeight: '600', color: theme.textPrimary },
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
  }
});