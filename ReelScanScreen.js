import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ActivityIndicator, Image, PanResponder, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { detectQuad, warpQuad } from './modules/quad-detect';
import GuideBox3D from './GuideBox3D';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const GRID_GAP = 4;
const REFINE_AREA_H = SCREEN_HEIGHT * 0.62;
const QW = (SCREEN_WIDTH - GRID_GAP) / 2;
const QH = (REFINE_AREA_H - GRID_GAP) / 2;
const ZOOM_LEVELS = [2, 5, 10];

const SCAN_STEPS = [
  { key: 'front', label: 'Front Cover', w: 103, h: 187, instructions: 'Position the FRONT cover inside the blue box.' },
  { key: 'left', label: 'Left Spine', w: 25, h: 187, instructions: 'Position the LEFT SPINE inside the blue box.' },
  { key: 'back', label: 'Back Cover', w: 103, h: 187, instructions: 'Position the BACK cover inside the blue box.' },
  { key: 'right', label: 'Right Spine', w: 25, h: 187, instructions: 'Position the RIGHT SPINE inside the blue box.' },
  { key: 'top', label: 'Top Flap', w: 103, h: 25, instructions: 'Position the TOP FLAP inside the blue box.' },
  { key: 'bottom', label: 'Tape Bottom', w: 103, h: 25, instructions: 'Position the TAPE BOTTOM inside the blue box.' },
];

const WARP_OUTPUT_SIZES = {
  front: [1030, 1870],
  back: [1030, 1870],
  left: [250, 1870],
  right: [250, 1870],
  top: [1030, 250],
  bottom: [1030, 250],
};

function orderCorners(pts) {
  const sum = (p) => p.x + p.y;
  const diff = (p) => p.y - p.x;
  const tl = pts.reduce((a, b) => (sum(a) <= sum(b) ? a : b));
  const br = pts.reduce((a, b) => (sum(a) >= sum(b) ? a : b));
  const tr = pts.reduce((a, b) => (diff(a) <= diff(b) ? a : b));
  const bl = pts.reduce((a, b) => (diff(a) >= diff(b) ? a : b));
  return [tl, tr, br, bl];
}

function polyAreaJS(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]; const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function isConvexQuadJS(pts) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i]; const b = pts[(i + 1) % 4]; const c = pts[(i + 2) % 4];
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cr) < 1e-3) return false;
    const s = cr > 0 ? 1 : -1;
    if (sign === 0) sign = s; else if (sign !== s) return false;
  }
  return true;
}

function DashedLine({ x1, y1, x2, y2 }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 2) return null;
  const ang = Math.atan2(dy, dx);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: (x1 + x2) / 2 - len / 2,
        top: (y1 + y2) / 2,
        width: len,
        height: 0,
        borderTopWidth: 2,
        borderTopColor: '#22dd55',
        borderStyle: 'dashed',
        transform: [{ rotate: `${ang}rad` }],
      }}
    />
  );
}

function Crosshair({ x, y }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: x - 14, top: y - 14, width: 28, height: 28 }}>
      <View style={{ position: 'absolute', left: 13, top: 0, width: 2, height: 28, backgroundColor: '#ff3b30' }} />
      <View style={{ position: 'absolute', left: 0, top: 13, width: 28, height: 2, backgroundColor: '#ff3b30' }} />
    </View>
  );
}

function CornerQuadrant({ uri, imgW, imgH, anchor, corners, scale, qIndex, responder }) {
  const S = scale;
  const toScreen = (p) => ({ x: QW / 2 + (p.x - anchor.x) * S, y: QH / 2 + (p.y - anchor.y) * S });
  const P = corners.map(toScreen);
  const segments = [[0, 1], [1, 2], [2, 3], [3, 0]];

  return (
    <View style={{ width: QW, height: QH, overflow: 'hidden', backgroundColor: '#000' }} {...responder.panHandlers}>
      <Image
        source={{ uri }}
        resizeMode="stretch"
        style={{
          position: 'absolute',
          width: imgW * S,
          height: imgH * S,
          left: QW / 2 - anchor.x * S,
          top: QH / 2 - anchor.y * S,
        }}
      />
      {segments.map(([a, b], i) => (
        <DashedLine key={i} x1={P[a].x} y1={P[a].y} x2={P[b].x} y2={P[b].y} />
      ))}
      <Crosshair x={P[qIndex].x} y={P[qIndex].y} />
    </View>
  );
}

export default function ReelScanScreen({ navigation, route }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const guideBoxRef = useRef(null);

  const [stepIndex, setStepIndex] = useState(0);
  const [capturedImages, setCapturedImages] = useState({});
  const [isCapturing, setIsCapturing] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [isRotating, setIsRotating] = useState(false);

  const [prevStepKey, setPrevStepKey] = useState(null);

  const [review, setReview] = useState(null);
  const [corners, setCorners] = useState(null);
  const [zoom, setZoom] = useState(5);

  const reviewRef = useRef(null);
  const cornersRef = useRef(null);
  const zoomRef = useRef(5);
  const scaleRef = useRef(1);
  const dragStart = useRef(null);

  const currentStep = SCAN_STEPS[stepIndex];
  const ratio = currentStep.h / currentStep.w;

  const setCornersSafe = (next) => {
    cornersRef.current = next;
    setCorners(next);
  };

  const calculateGuideBox = () => {
    const MAX_BOX_WIDTH = SCREEN_WIDTH * 0.85;
    const MAX_BOX_HEIGHT = SCREEN_HEIGHT * 0.65;
    const step = SCAN_STEPS[stepIndex];

    let boxWidth = MAX_BOX_WIDTH;
    let boxHeight = boxWidth * (step.h / step.w);

    if (boxHeight > MAX_BOX_HEIGHT) {
      boxHeight = MAX_BOX_HEIGHT;
      boxWidth = boxHeight * (step.w / step.h);
    }

    return { width: boxWidth, height: boxHeight };
  };

  const guideBox = calculateGuideBox();

  const clampPoint = (x, y, imgW, imgH) => ({
    x: Math.max(0, Math.min(imgW, x)),
    y: Math.max(0, Math.min(imgH, y)),
  });

  const baseScale = (imgW, imgH) => Math.min(QW, QH) / Math.max(imgW, imgH);

  const responders = useRef(
    [0, 1, 2, 3].map((idx) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragStart.current = { ...cornersRef.current[idx] };
        },
        onPanResponderMove: (evt, gs) => {
          const img = reviewRef.current;
          if (!img || !dragStart.current) return;
          const S = scaleRef.current;
          const next = [...cornersRef.current];
          next[idx] = clampPoint(dragStart.current.x + gs.dx / S, dragStart.current.y + gs.dy / S, img.imgW, img.imgH);
          setCornersSafe(next);
        },
      })
    )
  ).current;

  const measureGuideBox = () => {
    return new Promise((resolve) => {
      if (guideBoxRef.current) {
        guideBoxRef.current.measureInWindow((x, y, width, height) => {
          resolve({ x, y, width, height });
        });
      } else {
        resolve(null);
      }
    });
  };

  const detectCorners = async (normalizedUri, imgW, imgH, initQuad) => {
    try {
      const result = await detectQuad(normalizedUri, initQuad);
      if (Array.isArray(result) && result.length === 4) {
        const mapped = result.map((p) => ({
          x: Number(p.x),
          y: Number(p.y),
        })).map((p) => clampPoint(p.x, p.y, imgW, imgH));
        if (mapped.every((p) => isFinite(p.x) && isFinite(p.y))) {
          const ordered = orderCorners(mapped);
          const distinct = ordered.every((p, i) =>
            ordered.every((q, j) => i === j || Math.abs(p.x - q.x) > 4 || Math.abs(p.y - q.y) > 4)
          );
          if (distinct && isConvexQuadJS(ordered)) {
            return ordered;
          }
          console.warn('[ReelScan] detected quad failed sanity check (distinct/convex), using guess');
        }
      }
    } catch (e) {
      console.warn('[ReelScan] detectQuad failed:', e.message);
    }
    return initQuad;
  };

  const takePicture = async () => {
    if (isCapturing || !cameraRef.current) return;
    setIsCapturing(true);
    setDetecting(true);

    try {
      const measured = await measureGuideBox();

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
        shutterSound: false,
      });

      const rawIsLandscape = photo.width > photo.height;
      const screenIsPortrait = SCREEN_HEIGHT > SCREEN_WIDTH;

      let actions = [];
      if (rawIsLandscape && screenIsPortrait) {
        actions.push({ rotate: 90 });
      }
      actions.push({ resize: { width: 2000 } });

      const normalized = await ImageManipulator.manipulateAsync(
        photo.uri,
        actions,
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );

      const imgW = normalized.width;
      const imgH = normalized.height;

      const k = Math.min(imgW / SCREEN_WIDTH, imgH / SCREEN_HEIGHT);
      const offsetX = (imgW - SCREEN_WIDTH * k) / 2;
      const offsetY = (imgH - SCREEN_HEIGHT * k) / 2;

      const frame = (measured && measured.width > 0)
        ? measured
        : {
            x: (SCREEN_WIDTH - guideBox.width) / 2,
            y: (SCREEN_HEIGHT - guideBox.height) / 2,
            width: guideBox.width,
            height: guideBox.height,
          };

      const initW = frame.width * k;
      const initH = initW * ratio;
      const initCx = offsetX + (frame.x + frame.width / 2) * k;
      const initCy = offsetY + (frame.y + frame.height / 2) * k;

      const initQuad = [
        { x: initCx - initW / 2, y: initCy - initH / 2 },
        { x: initCx + initW / 2, y: initCy - initH / 2 },
        { x: initCx + initW / 2, y: initCy + initH / 2 },
        { x: initCx - initW / 2, y: initCy + initH / 2 },
      ].map((p) => clampPoint(p.x, p.y, imgW, imgH));

      console.log("========================================");
      console.log(`[DEBUG] Scanning: ${currentStep.label}`);
      console.log(`[DEBUG] Normalized: ${imgW}x${imgH}, k=${k.toFixed(3)}`);
      console.log(`[DEBUG] Initial quad guess:`, initQuad.map((p) => `(${Math.round(p.x)},${Math.round(p.y)})`).join(' '));

      const detectedQuad = await detectCorners(normalized.uri, imgW, imgH, initQuad);

      console.log(`[DEBUG] Detected quad (ordered TL TR BR BL):`, detectedQuad.map((p) => `(${Math.round(p.x)},${Math.round(p.y)})`).join(' '));
      console.log("========================================");

      reviewRef.current = { uri: normalized.uri, imgW, imgH, anchors: detectedQuad };
      setReview({ uri: normalized.uri, imgW, imgH, anchors: detectedQuad });
      setCornersSafe(detectedQuad);
      setZoom(5);
      zoomRef.current = 5;
      scaleRef.current = baseScale(imgW, imgH) * 5;
    } catch (error) {
      console.error("[DEBUG] Capture/Process failed:", error);
    } finally {
      setIsCapturing(false);
      setDetecting(false);
    }
  };

  const changeZoom = (z) => {
    const img = reviewRef.current;
    if (!img) return;
    zoomRef.current = z;
    setZoom(z);
    scaleRef.current = baseScale(img.imgW, img.imgH) * z;
  };

  const rotateReview = async () => {
    const img = reviewRef.current;
    const quad = cornersRef.current;
    if (!img || !quad || isRotating) return;
    setIsRotating(true);
    try {
      const res = await ImageManipulator.manipulateAsync(
        img.uri,
        [{ rotate: 90 }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
      const nw = res.width;
      const nh = res.height;
      const mapped = quad.map((p) => clampPoint(img.imgH - 1 - p.y, p.x, nw, nh));
      const ordered = orderCorners(mapped);

      reviewRef.current = { uri: res.uri, imgW: nw, imgH: nh, anchors: ordered };
      setReview({ uri: res.uri, imgW: nw, imgH: nh, anchors: ordered });
      setCornersSafe(ordered);
      scaleRef.current = baseScale(nw, nh) * zoomRef.current;
    } catch (error) {
      console.error('[DEBUG] Rotate failed:', error);
    } finally {
      setIsRotating(false);
    }
  };

  const confirmCrop = async () => {
    try {
      const img = reviewRef.current;
      const quad = cornersRef.current;
      if (!img || !quad) return;

      const xs = quad.map((p) => p.x);
      const ys = quad.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const margin = Math.max(6, 0.02 * Math.max(maxX - minX, maxY - minY));

      const originX = Math.max(0, Math.floor(minX - margin));
      const originY = Math.max(0, Math.floor(minY - margin));
      const cropW = Math.min(img.imgW, Math.ceil(maxX + margin)) - originX;
      const cropH = Math.min(img.imgH, Math.ceil(maxY + margin)) - originY;

      const resizeAction = cropW > cropH ? { resize: { width: 1024 } } : { resize: { height: 1024 } };

      const finalResult = await ImageManipulator.manipulateAsync(
        img.uri,
        [
          { crop: { originX, originY, width: cropW, height: cropH } },
          resizeAction,
        ],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      const scanDirectory = new Directory(Paths.document, 'tape-scans');
      if (!scanDirectory.exists) {
        scanDirectory.create({ intermediates: true, idempotent: true });
      }
      const sourceFile = new File(finalResult.uri);
      const imageId = Date.now();
      const savedFile = new File(
        scanDirectory,
        `${imageId}-${currentStep.key}-source.jpg`
      );
      sourceFile.copy(savedFile);

      const cornersNorm = quad.map((p) => ({
        x: Math.max(0, Math.min(1, (p.x - originX) / cropW)),
        y: Math.max(0, Math.min(1, (p.y - originY) / cropH)),
      }));

      console.log("========================================");
      console.log(`[DEBUG] Confirmed ${currentStep.label}: crop ${cropW}x${cropH} @(${originX},${originY})`);
      console.log(`[DEBUG] Normalized corners:`, cornersNorm.map((p) => `(${p.x.toFixed(3)},${p.y.toFixed(3)})`).join(' '));
      console.log("========================================");

      let textureUri = savedFile.uri;
      let isWarped = false;

      try {
        const [outW, outH] = WARP_OUTPUT_SIZES[currentStep.key];
        const warpResult = await warpQuad(
          savedFile.uri,
          cornersNorm,
          outW,
          outH,
          false
        );

        if (warpResult?.uri) {
          const warpedFile = new File(
            scanDirectory,
            `${imageId}-${currentStep.key}-texture.jpg`
          );
          new File(warpResult.uri).copy(warpedFile);
          savedFile.delete();
          textureUri = warpedFile.uri;
          isWarped = true;
        }
      } catch (warpError) {
        console.warn(`[ReelScan] Could not pre-warp ${currentStep.key}`, warpError);
      }

      const updatedImages = {
        ...capturedImages,
        [currentStep.key]: {
          uri: textureUri,
          corners: cornersNorm,
          isWarped,
        },
      };
      setCapturedImages(updatedImages);

      reviewRef.current = null;
      setReview(null);
      setCorners(null);

      if (stepIndex < SCAN_STEPS.length - 1) {
        setPrevStepKey(currentStep.key);
        setStepIndex(stepIndex + 1);
      } else {
        const returnTo = route.params?.returnTo;
        if (returnTo) {
          await AsyncStorage.setItem('pending_texture_map', JSON.stringify(updatedImages));
          navigation.goBack();
        } else {
          navigation.replace('Tape3DViewer', {
            textureMap: updatedImages,
            title: 'My 3D Scan',
          });
        }
      }
    } catch (error) {
      console.error("[DEBUG] Confirm crop failed:", error);
    }
  };

  const retake = () => {
    reviewRef.current = null;
    setReview(null);
    setCorners(null);
  };

  const exitScan = () => {
    Alert.alert(
      'Discard Scan?',
      'Are you sure you want to exit? Any captured faces for this item will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.goBack(),
        }
      ]
    );
  };

  const goBack = () => {
    if (review) { retake(); return; }
    if (stepIndex > 0) {
      const newStep = stepIndex - 1;
      const stepKey = SCAN_STEPS[newStep].key;
      const updatedImages = { ...capturedImages };
      delete updatedImages[stepKey];
      setCapturedImages(updatedImages);
      setPrevStepKey(currentStep.key);
      setStepIndex(newStep);
    } else {
      navigation.goBack();
    }
  };

  useEffect(() => {
    if (!permission) requestPermission();
  }, [permission]);

  useEffect(() => {
    console.log('[ReelScan] screen v7-onnx mounted');
  }, []);

  if (!permission) return <View style={styles.center}><ActivityIndicator size="large" color="#e07a5f" /></View>;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>We need your camera to scan your media!</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Camera Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (review && corners) {
    const S = baseScale(review.imgW, review.imgH) * zoom;
    scaleRef.current = S;

    return (
      <View style={styles.container}>
        <View style={styles.refineHeader}>
          <View style={styles.refineSide}>
            <TouchableOpacity onPress={goBack} style={styles.refineBackBtn}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.refineTitleWrap}>
            <Text style={styles.refineTitle}>Refine Corners</Text>
            <Text style={styles.refineStep}>{stepIndex + 1} / {SCAN_STEPS.length}</Text>
            <Text style={styles.refineHint}>drag corners to align dotted lines to edges of box art</Text>
          </View>
          <View style={styles.refineSide}>
            <TouchableOpacity onPress={exitScan} style={styles.refineCloseBtn}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.quadGrid}>
          <View style={styles.quadRow}>
            <CornerQuadrant uri={review.uri} imgW={review.imgW} imgH={review.imgH} anchor={corners[0]} corners={corners} scale={S} qIndex={0} responder={responders[0]} />
            <CornerQuadrant uri={review.uri} imgW={review.imgW} imgH={review.imgH} anchor={corners[1]} corners={corners} scale={S} qIndex={1} responder={responders[1]} />
          </View>
          <View style={styles.quadRow}>
            <CornerQuadrant uri={review.uri} imgW={review.imgW} imgH={review.imgH} anchor={corners[3]} corners={corners} scale={S} qIndex={3} responder={responders[3]} />
            <CornerQuadrant uri={review.uri} imgW={review.imgW} imgH={review.imgH} anchor={corners[2]} corners={corners} scale={S} qIndex={2} responder={responders[2]} />
          </View>
        </View>

        <View style={styles.zoomRow}>
          {ZOOM_LEVELS.map((z) => (
            <TouchableOpacity
              key={z}
              style={[styles.zoomBtn, zoom === z && styles.zoomBtnActive]}
              onPress={() => changeZoom(z)}
            >
              <Text style={[styles.zoomBtnText, zoom === z && styles.zoomBtnTextActive]}>{z}×</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.rotateBtn}
            onPress={rotateReview}
            disabled={isRotating}
          >
            <Ionicons name="refresh" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.reviewControls}>
          <TouchableOpacity style={styles.retakeBtn} onPress={retake}>
            <Text style={styles.btnText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.confirmBtn} onPress={confirmCrop}>
            <Text style={styles.btnText}>Next</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={StyleSheet.absoluteFill} ref={cameraRef} facing="back" />

      <View style={styles.overlay}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={styles.stepIndicator}>
            <Text style={styles.stepText}>{stepIndex + 1} / {SCAN_STEPS.length}</Text>
            <Text style={styles.labelText}>{currentStep.label}</Text>
          </View>
          <TouchableOpacity onPress={exitScan} style={styles.closeBtn}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.guideContainer}>
          <GuideBox3D
            stepKey={currentStep.key}
            fromKey={prevStepKey}
            captured={capturedImages}
            guideWidth={guideBox.width}
            guideHeight={guideBox.height}
          />
          <View
            ref={guideBoxRef}
            style={[styles.guideBoxAnchor, { width: guideBox.width, height: guideBox.height }]}
          />
        </View>

        <View style={styles.instructionsWrap} pointerEvents="none">
          <Text style={styles.instructions}>{currentStep.instructions}</Text>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
            onPress={takePicture}
            disabled={isCapturing}
          >
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>
        </View>
      </View>

      {detecting && (
        <View style={styles.detectOverlay} pointerEvents="none">
          <Text style={styles.detectText}>Detecting corners...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  permissionText: { color: '#fff', fontSize: 16, marginBottom: 20, paddingHorizontal: 40, textAlign: 'center' },
  permissionButton: { backgroundColor: '#e07a5f', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  permissionButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  overlay: { flex: 1, backgroundColor: 'transparent', justifyContent: 'space-between' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 50 },
  backBtn: { padding: 5 },
  closeBtn: { padding: 5 }, // Matches backBtn padding for perfect alignment
  stepIndicator: { alignItems: 'center' },
  stepText: { color: '#e07a5f', fontSize: 14, fontWeight: 'bold' },
  labelText: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginTop: 4 },
  guideContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  guideBoxAnchor: { backgroundColor: 'transparent' },
  // Moved out of guideContainer, reduced font size, added padding for clean separation
  instructionsWrap: { alignItems: 'center', paddingVertical: 12 },
  instructions: { color: '#fff', fontSize: 14, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 6, paddingHorizontal: 16, borderRadius: 20, overflow: 'hidden' },
  controls: { alignItems: 'center', paddingBottom: 40 },
  captureButton: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  captureButtonDisabled: { opacity: 0.5 },
  captureButtonInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff' },
  detectOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  detectText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  refineHeader: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 50 },
  refineSide: { width: 40 },
  refineBackBtn: { padding: 5, marginTop: 2 },
  refineCloseBtn: { padding: 5, marginTop: 2 }, // Matches refineBackBtn padding
  refineTitleWrap: { flex: 1, alignItems: 'center' },
  refineTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  refineStep: { color: '#888', fontSize: 13, marginTop: 2 },
  refineHint: { color: '#aaa', fontSize: 12, marginTop: 4, textAlign: 'center', paddingHorizontal: 30 },
  quadGrid: { marginTop: 12, paddingHorizontal: 0 },
  quadRow: { flexDirection: 'row', justifyContent: 'center', gap: GRID_GAP, marginBottom: GRID_GAP },
  zoomRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 6, marginBottom: 14 },
  zoomBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 18, backgroundColor: '#3a3a3a' },
  zoomBtnActive: { backgroundColor: '#ffffff' },
  zoomBtnText: { color: '#ddd', fontSize: 14, fontWeight: '600' },
  zoomBtnTextActive: { color: '#000' },
  rotateBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#3a3a3a', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  reviewControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 40,
    paddingBottom: 30,
  },
  retakeBtn: { backgroundColor: '#c8102e', paddingHorizontal: 42, paddingVertical: 15, borderRadius: 30 },
  confirmBtn: { backgroundColor: '#0aa54c', paddingHorizontal: 42, paddingVertical: 15, borderRadius: 30 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});