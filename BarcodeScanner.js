import React, { useState, useEffect } from 'react'; 
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { CameraView, Camera } from 'expo-camera'; 

export default function BarcodeScanner({ route, navigation }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  
  const collectionId = route.params?.collectionId || null;
  const allowedFormats = route.params?.allowedFormats || null;
  const returnToCollection = route.params?.returnToCollection || false;
  
  useEffect(() => {
    const getCameraPermissions = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    };
    getCameraPermissions();
  }, []);

  const handleBarcodeScanned = ({ type, data }) => {
    if (scanned) return; 
    setScanned(true);
    
    Alert.alert(
      'Barcode Found!',
      `Found barcode: ${data}\n\nSearch by barcode?`,
      [
        { text: 'Cancel', onPress: () => setScanned(false), style: 'cancel' },
        { 
          text: 'Search', 
          onPress: () => navigation.navigate('AddTape', { 
            barcode: data,
            collectionId,
            allowedFormats,
            returnToCollection,
          })
        }
      ]
    );
  };

  const resetScanner = () => {
    setScanned(false);
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No access to camera. Please enable it in settings.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39"],
        }}
      />

      <View style={styles.overlay} />

      <View style={styles.header}>
        <Text style={styles.headerText}>Scan Barcode</Text>
        {collectionId && allowedFormats && (
          <Text style={styles.collectionBannerText}>
            Adding to collection ({allowedFormats.join(' • ')})
          </Text>
        )}
        <Text style={styles.subText}>
          {scanned ? 'Tap below to scan another' : 'Point the camera at a UPC/EAN barcode'}
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        {scanned ? (
          <TouchableOpacity style={styles.resetButton} onPress={resetScanner}>
            <Text style={styles.resetButtonText}>Scan Another</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={styles.manualButton} 
            onPress={() => navigation.navigate('AddTape', { collectionId, allowedFormats, returnToCollection })}
          >
            <Text style={styles.manualButtonText}>✏️ Manual Entry</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  header: { position: 'absolute', top: 80, left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  headerText: { fontSize: 24, fontWeight: 'bold', color: '#ffffff', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 12, borderRadius: 8, marginBottom: 8 },
  collectionBannerText: {
    color: '#e50914',
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 6,
    borderRadius: 6,
    marginBottom: 8,
  },
  subText: { fontSize: 14, color: '#cccccc', backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 6 },
  buttonContainer: { position: 'absolute', bottom: 40, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 15, zIndex: 10 },
  manualButton: { backgroundColor: '#333333', paddingVertical: 16, paddingHorizontal: 24, borderRadius: 30, borderWidth: 1, borderColor: '#555555' },
  manualButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  resetButton: { backgroundColor: '#e50914', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 30 },
  resetButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  cancelButton: { backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 16, paddingHorizontal: 24, borderRadius: 30 },
  cancelButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  text: { color: '#fff', fontSize: 18, textAlign: 'center', padding: 20 },
});
