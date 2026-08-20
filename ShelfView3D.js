import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  PanResponder,
  Text,
  Dimensions,
} from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MediaItem3D } from './Media3DViewer';
import { Ionicons } from '@expo/vector-icons';
import { 
  getModel, 
  resolveModelId, 
  getCameraDistance, 
  DEFAULT_MODEL_ID,
  getCategory,
  MEDIA_CATEGORIES 
} from './mediaModels';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTheme, DEFAULT_THEME_ID } from './theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/* ============================================================
 * CONFIGURATION
 * ============================================================ */

const PIXELS_PER_UNIT = 120;
const SHELF_BASE_Y = -0.9; // The Y-coordinate (in world units) where the bottom of all items rest
const H_VISIBLE_MARGIN = 1.0;
const CAMERA_FOLLOW_SPEED = 16;
const ANIMATION_SPEED = 0.06;
const DRAG_ROTATION_SPEED = 0.012;
const MAX_X_ROTATION = Math.PI * 0.48;
const FOCUS_ROTATION_SPEED = 0.08;
const FOCUS_DRAG_ZONE_WIDTH_RATIO = 0.68;
const FOCUS_DRAG_ZONE_HEIGHT_RATIO = 0.62;
const HIT_TARGET_WIDTH_SCALE = 0.92;

const VIEW_MODE_OPTIONS = [
  { value: 'grid', label: 'Grid View', icon: 'grid-outline' },
  { value: 'list', label: 'List View', icon: 'list-outline' },
  { value: '3d', label: '3D View', icon: 'cube-outline' },
];

/* ============================================================
 * SHELF HELPERS
 * ============================================================ */

function getSpacing(model, orientation) {
  return orientation === 'cover' ? model.shelf.spacing.cover : (model.shelf.spacing.spine ?? model.shelf.spacing.cover);
}

function getFaceWidth(model, orientation) {
  return orientation === 'cover' ? model.dims.w : model.dims.d;
}

function getEffectiveDims(item, model) {
  const customData = item.customData || item.textureMap?.customData;
  if (customData?.customDimsMM) {
    return {
      w: customData.customDimsMM.w / 100,
      h: customData.customDimsMM.h / 100,
      d: customData.customDimsMM.d / 100,
    };
  }
  return model.dims;
}

/* ============================================================
 * UTILITIES
 * ============================================================ */

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/* ============================================================
 * INDIVIDUAL 3D ITEM
 * ============================================================ */

function ItemOnShelf({
  item,
  customData,
  position,
  orientation,
  isFocused,
  focusedId,
  cullDistance,
  dragRotationRef,
  itemModelId,
  itemModel,
  focusZ,
  bodyColor,
  placeholderColor,
  missingColor,
  spineTextColor,
}) {
  const groupRef = useRef(null);

  const targetPos = useRef(
    new THREE.Vector3(position[0], position[1], position[2])
  );

  const targetRot = useRef(
    new THREE.Euler(0, orientation === 'spine' ? Math.PI / 2 : 0, 0)
  );

  const wasFocused = useRef(false);

  const [renderFull, setRenderFull] = useState(
    () => isFocused || Math.abs(position[0]) < cullDistance
  );

  const renderFullRef = useRef(renderFull);

  useEffect(() => {
    renderFullRef.current = renderFull;
  }, [renderFull]);

  useEffect(() => {
    if (isFocused && !wasFocused.current) {
      dragRotationRef.current.x = 0;
      dragRotationRef.current.y = 0;
      dragRotationRef.current.z = 0;

      targetRot.current.set(0, 0, 0);

      if (groupRef.current) {
        groupRef.current.rotation.set(
          0,
          orientation === 'spine' ? Math.PI / 2 : 0,
          0
        );
      }

      if (!renderFullRef.current) {
        renderFullRef.current = true;
        setRenderFull(true);
      }
    }

    wasFocused.current = isFocused;
  }, [isFocused, orientation, dragRotationRef]);

  useFrame(({ camera }) => {
    const group = groupRef.current;
    if (!group) return;

    const cameraX = isFiniteNumber(camera.position.x)
      ? camera.position.x
      : position[0];

    const shouldRenderFull =
      isFocused || Math.abs(cameraX - position[0]) < cullDistance;

    if (shouldRenderFull !== renderFullRef.current) {
      renderFullRef.current = shouldRenderFull;
      setRenderFull(shouldRenderFull);
    }

    if (isFocused) {
      targetPos.current.set(camera.position.x, 0, focusZ);

      const m = dragRotationRef.current;

      if (
        !isFiniteNumber(m.x) ||
        !isFiniteNumber(m.y) ||
        !isFiniteNumber(m.z)
      ) {
        dragRotationRef.current = { x: 0, y: 0, z: 0 };
      }
    } else {
      // Push non-focused items back into the shelf when another item is focused
      const pushBackZ = focusedId ? -1.2 : 0;
      targetPos.current.set(position[0], position[1], position[2] + pushBackZ);

      targetRot.current.set(
        0,
        orientation === 'spine' ? Math.PI / 2 : 0,
        0
      );
    }

    if (
      !isFiniteNumber(group.position.x) ||
      !isFiniteNumber(group.position.y) ||
      !isFiniteNumber(group.position.z)
    ) {
      group.position.copy(targetPos.current);
    } else {
      group.position.lerp(targetPos.current, ANIMATION_SPEED);
    }

    const rotTarget = isFocused
      ? dragRotationRef.current
      : targetRot.current;

    if (
      !isFiniteNumber(group.rotation.x) ||
      !isFiniteNumber(group.rotation.y) ||
      !isFiniteNumber(group.rotation.z)
    ) {
      group.rotation.set(rotTarget.x, rotTarget.y, rotTarget.z);
    } else {
      const speed = isFocused ? FOCUS_ROTATION_SPEED : ANIMATION_SPEED;

      group.rotation.x += (rotTarget.x - group.rotation.x) * speed;
      group.rotation.y += (rotTarget.y - group.rotation.y) * speed;
      group.rotation.z += (rotTarget.z - group.rotation.z) * speed;
    }
  });

  const effectiveDims = getEffectiveDims(item, itemModel);

  return (
    <group ref={groupRef} position={position}>
      {renderFull || isFocused ? (
        <MediaItem3D 
          textureMap={item.textureMap} 
          modelId={itemModelId} 
          customData={customData}
          bodyColor={bodyColor}
          placeholderColor={placeholderColor}
          missingColor={missingColor}
          title={item.title || item.name || ''}
          spineTextColor={spineTextColor}
          isFocused={isFocused} // <--- Pass focus state down to skip heavy 3D text on non-focused items
        />
      ) : (
        <mesh>
          <boxGeometry args={[effectiveDims.w, effectiveDims.h, effectiveDims.d]} />
          <meshStandardMaterial color={placeholderColor} roughness={0.85} />
        </mesh>
      )}
    </group>
  );
}

/* ============================================================
 * 3D SCENE
 * ============================================================ */

function ShelfScene({
  items,
  itemPositions,
  orientation,
  focusedId,
  scrollXRef,
  snapCameraRef,
  cullDistance,
  dragRotationRef,
  defaultCameraZ,
  focusZ,
  bodyColor,
  placeholderColor,
  missingColor,
  spineTextColor,
}) {
  useFrame(({ camera }, delta) => {
    const safeDelta = clamp(
      isFiniteNumber(delta) ? delta : 0.016,
      0.001,
      0.1
    );

    if (focusedId) {
      snapCameraRef.current = false;
      return;
    }

    const targetX = isFiniteNumber(scrollXRef.current)
      ? scrollXRef.current / PIXELS_PER_UNIT
      : 0;

    if (snapCameraRef.current) {
      camera.position.set(targetX, 0, defaultCameraZ);
      snapCameraRef.current = false;
      return;
    }

    const alpha = 1 - Math.exp(-CAMERA_FOLLOW_SPEED * safeDelta);

    camera.position.x = THREE.MathUtils.lerp(
      camera.position.x,
      targetX,
      alpha
    );

    camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0, alpha);

    camera.position.z = THREE.MathUtils.lerp(
      camera.position.z,
      defaultCameraZ,
      alpha
    );
  });

  return (
    <>
      <ambientLight intensity={0.68} />
      <directionalLight position={[5, 8, 6]} intensity={0.95} />
      <directionalLight position={[-5, 2, 4]} intensity={0.35} />
      <pointLight position={[0, 3, 3]} intensity={0.25} distance={12} />

      {items.map((item, itemIndex) => {
        const wx = itemPositions[itemIndex] || 0;

        const itemModelId = item.modelId 
          || item.textureMap?.modelId 
          || resolveModelId(item.format, item.caseType);
        const itemModel = getModel(itemModelId);
        const customData = item.customData || item.textureMap?.customData;
        
        const effDims = getEffectiveDims(item, itemModel);
        // Calculate Y so the bottom of the item rests exactly on SHELF_BASE_Y
        const wy = (effDims.h / 2) + SHELF_BASE_Y;

        return (
          <ItemOnShelf
            key={item.id}
            item={item}
            customData={customData}
            position={[wx, wy, 0]}
            orientation={orientation}
            isFocused={focusedId === item.id}
            focusedId={focusedId}
            cullDistance={cullDistance}
            dragRotationRef={dragRotationRef}
            itemModelId={itemModelId}
            itemModel={itemModel}
            focusZ={focusZ}
            bodyColor={bodyColor}
            placeholderColor={placeholderColor}
            missingColor={missingColor}
            spineTextColor={spineTextColor}
          />
        );
      })}
    </>
  );
}

/* ============================================================
 * NATIVE HIT TARGETS
 * ============================================================ */

function ShelfHitTargets({ items, itemPositions, orientation, onFocus, contentWidth, model }) {
  return (
    <View style={{ width: contentWidth, height: SCREEN_HEIGHT }}>
      {items.map((item, itemIndex) => {
        const wx = itemPositions[itemIndex] || 0;
        const centerX = SCREEN_WIDTH / 2 + wx * PIXELS_PER_UNIT;
        
        const itemModelId = item.modelId || item.textureMap?.modelId || resolveModelId(item.format, item.caseType);
        const itemModel = getModel(itemModelId);
        const effDims = getEffectiveDims(item, itemModel);
        
        const itemHitHeight = effDims.h * PIXELS_PER_UNIT;
        const hitWidth = (orientation === 'cover' ? effDims.w : effDims.d) * PIXELS_PER_UNIT * HIT_TARGET_WIDTH_SCALE;

        const left = centerX - hitWidth / 2;
        
        // Align the bottom of the 2D hit target with the 3D shelf base
        const shelfBaseScreenY = (SCREEN_HEIGHT / 2) - (SHELF_BASE_Y * PIXELS_PER_UNIT);
        const top = shelfBaseScreenY - itemHitHeight;

        return (
          <TouchableOpacity
            key={`hit-${item.id}`}
            activeOpacity={1}
            onPress={() => onFocus(item.id)}
            style={{
              position: 'absolute',
              left,
              top,
              width: hitWidth,
              height: itemHitHeight,
            }}
          />
        );
      })}
    </View>
  );
}

/* ============================================================
 * MAIN COMPONENT
 * ============================================================ */

export default function ShelfView3D({
  items,
  onBack,
  onViewModeChange,
  onOpenFilters,
}) {
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

  const [orientation, setOrientation] = useState('spine');
  const [focusedId, setFocusedId] = useState(null);
  const [showViewMenu, setShowViewMenu] = useState(false);

  const scrollXRef = useRef(0);
  const snapCameraRef = useRef(true);
  const scrollViewRef = useRef(null);
  const randomItemTimeoutRef = useRef(null);

  const dragRotationRef = useRef({ x: 0, y: 0, z: 0 });
  const dragBaseRotationRef = useRef({ x: 0, y: 0, z: 0 });

  // Derive the base layout model for the shelf from the first item
  const firstItem = items[0];
  const baseModelId = firstItem 
    ? (firstItem.modelId || firstItem.textureMap?.modelId || resolveModelId(firstItem.format, firstItem.caseType)) 
    : DEFAULT_MODEL_ID;
  const model = getModel(baseModelId);

  // Determine supported orientations and active orientation (Fixes vinyl bug)
  const supportedOrientations = model.shelf.orientations && model.shelf.orientations.length
    ? model.shelf.orientations
    : ['spine', 'cover'];
  const activeOrientation = supportedOrientations.includes(orientation)
    ? orientation
    : supportedOrientations[0];

  // Calculate uniform gap based on the base model's standard spacing
  const baseSpacing = getSpacing(model, activeOrientation);
  const baseWidth = getFaceWidth(model, activeOrientation);
  const uniformGap = Math.max(0, baseSpacing - baseWidth);

  // Calculate cumulative positions maintaining a consistent gap regardless of item size
  const itemPositions = useMemo(() => {
    const positions = [];
    let currentCenter = 0;
    
    items.forEach((item, index) => {
      positions.push(currentCenter);
      
      if (index < items.length - 1) {
        const currentId = item.modelId || item.textureMap?.modelId || resolveModelId(item.format, item.caseType);
        const currentModel = getModel(currentId);
        const currentDims = getEffectiveDims(item, currentModel);
        const currentWidth = activeOrientation === 'cover' ? currentDims.w : currentDims.d;
        
        const nextItem = items[index + 1];
        const nextId = nextItem.modelId || nextItem.textureMap?.modelId || resolveModelId(nextItem.format, nextItem.caseType);
        const nextModel = getModel(nextId);
        const nextDims = getEffectiveDims(nextItem, nextModel);
        const nextWidth = activeOrientation === 'cover' ? nextDims.w : nextDims.d;
        
        // Distance to next center = half of current + gap + half of next
        currentCenter += (currentWidth / 2) + uniformGap + (nextWidth / 2);
      }
    });
    return positions;
  }, [items, activeOrientation, uniformGap]);

  // Determine category for dynamic UI (Artist vs Director)
  const category = getCategory(baseModelId);
  const isMusic = category === MEDIA_CATEGORIES.MUSIC;

  // Find the currently focused item to display metadata
  const focusedItem = focusedId ? items.find(item => item.id === focusedId) : null;

  // Fix 1: Camera distance calculation to prevent behind-shelf rendering
  const maxDim = Math.max(model.dims.w, model.dims.h, model.dims.d);
  const screenAspect = SCREEN_WIDTH / SCREEN_HEIGHT;
  const cameraFitDistance = getCameraDistance(baseModelId, screenAspect);

  const shelfDepthExtent =
    (activeOrientation === 'spine' ? model.dims.w : model.dims.d) / 2;

  const defaultCameraZ = Math.max(
    maxDim * 2.7,
    cameraFitDistance + shelfDepthExtent + model.dims.d / 2 + 0.15
  );
  const focusZ = defaultCameraZ - cameraFitDistance;

  const maxCameraX = itemPositions.length > 0 ? itemPositions[itemPositions.length - 1] : 0;
  const maxScrollPx = maxCameraX * PIXELS_PER_UNIT;

  const contentWidth = SCREEN_WIDTH + maxScrollPx;
  const contentHeight = SCREEN_HEIGHT;

  // Fix 3: Increase cull distance to account for item's own face width
  const cullDistance =
    SCREEN_WIDTH / PIXELS_PER_UNIT / 2 +
    getFaceWidth(model, activeOrientation) / 2 +
    H_VISIBLE_MARGIN;

  useEffect(() => {
    if (focusedId && !items.some(item => item.id === focusedId)) {
      setFocusedId(null);
    }
  }, [items, focusedId]);

  useEffect(() => {
    return () => {
      if (randomItemTimeoutRef.current) {
        clearTimeout(randomItemTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (scrollXRef.current > maxScrollPx) {
      scrollXRef.current = maxScrollPx;
      snapCameraRef.current = true;

      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTo({
          x: maxScrollPx,
          animated: false,
        });
      }
    }
  }, [maxScrollPx]);

  const handleOrientationChange = () => {
    if (focusedId) return;
    if (supportedOrientations.length < 2) return;

    setOrientation(current =>
      current === 'spine' ? 'cover' : 'spine'
    );

    scrollXRef.current = 0;
    snapCameraRef.current = true;
  };

  const handleScroll = event => {
    const nextX = event.nativeEvent.contentOffset.x;

    scrollXRef.current = clamp(
      isFiniteNumber(nextX) ? nextX : 0,
      0,
      maxScrollPx
    );
  };

  const handleFocus = id => {
    if (randomItemTimeoutRef.current) {
      clearTimeout(randomItemTimeoutRef.current);
      randomItemTimeoutRef.current = null;
    }
    setFocusedId(id);
  };

  const handleReturn = () => setFocusedId(null);

  const handleRandomItem = () => {
    if (items.length === 0 || focusedId) return;

    const randomIndex = Math.floor(Math.random() * items.length);
    const randomItem = items[randomIndex];
    const targetScrollX = (itemPositions[randomIndex] || 0) * PIXELS_PER_UNIT;

    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        x: targetScrollX,
        animated: true,
      });

      if (randomItemTimeoutRef.current) {
        clearTimeout(randomItemTimeoutRef.current);
      }

      randomItemTimeoutRef.current = setTimeout(() => {
        setFocusedId(randomItem.id);
      }, 600);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragBaseRotationRef.current = { ...dragRotationRef.current };
      },
      onPanResponderMove: (_evt, gestureState) => {
        dragRotationRef.current.y =
          dragBaseRotationRef.current.y +
          gestureState.dx * DRAG_ROTATION_SPEED;

        dragRotationRef.current.x = clamp(
          dragBaseRotationRef.current.x +
            gestureState.dy * DRAG_ROTATION_SPEED,
          -MAX_X_ROTATION,
          MAX_X_ROTATION
        );
      },
    })
  ).current;

  const handleSelectViewMode = value => {
    setShowViewMenu(false);

    if (onViewModeChange) {
      onViewModeChange(value);
    }
  };

  const dragZoneWidth = SCREEN_WIDTH * FOCUS_DRAG_ZONE_WIDTH_RATIO;
  const dragZoneHeight = SCREEN_HEIGHT * FOCUS_DRAG_ZONE_HEIGHT_RATIO;

  return (
    <View style={styles.container}>
      <Canvas
        pointerEvents="none"
        camera={{
          position: [0, 0, defaultCameraZ],
          fov: 50,
        }}
        style={StyleSheet.absoluteFill}
        gl={{
          preserveDrawingBuffer: true,
          antialias: true,
        }}
      >
        <color attach="background" args={[theme.background]} />

        <ShelfScene
          items={items}
          itemPositions={itemPositions}
          orientation={activeOrientation}
          focusedId={focusedId}
          scrollXRef={scrollXRef}
          snapCameraRef={snapCameraRef}
          cullDistance={cullDistance}
          dragRotationRef={dragRotationRef}
          defaultCameraZ={defaultCameraZ}
          focusZ={focusZ}
          bodyColor={theme.cardBackground}
          placeholderColor={theme.cardBackground}
          missingColor={theme.background}
          spineTextColor={theme.accent}
        />
      </Canvas>

      <ScrollView
        ref={scrollViewRef}
        key={`h-${activeOrientation}`}
        horizontal
        style={StyleSheet.absoluteFill}
        contentContainerStyle={{
          width: contentWidth,
          height: contentHeight,
        }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        scrollEnabled={!focusedId}
        pointerEvents={focusedId ? 'none' : 'auto'}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        bounces={false}
        alwaysBounceHorizontal={false}
        directionalLockEnabled
        decelerationRate="fast"
        snapToInterval={Math.max(baseSpacing * PIXELS_PER_UNIT, 1)}
        snapToAlignment="start"
        disableIntervalMomentum={false}
        nestedScrollEnabled
        overScrollMode="never"
      >
        <ShelfHitTargets
          items={items}
          itemPositions={itemPositions}
          orientation={activeOrientation}
          onFocus={handleFocus}
          contentWidth={contentWidth}
          model={model}
        />
      </ScrollView>

      {/* ================================================== */}
      {/* FOCUSED ITEM METADATA OVERLAY (TOP CENTER)         */}
      {/* ================================================== */}
      {focusedItem && (
        <View style={styles.focusedItemInfoContainer} pointerEvents="none">
          <View style={styles.focusedItemPill}>
            <Text style={styles.focusedItemTitle} numberOfLines={1}>
              {focusedItem.title || 'Unknown Title'}
            </Text>
            <Text style={styles.focusedItemMeta} numberOfLines={1}>
              {focusedItem.year ? `${focusedItem.year} • ` : ''}
              {isMusic ? 'Artist' : 'Director'}: {focusedItem.director || 'Unknown'}
            </Text>
          </View>
        </View>
      )}

      {focusedId && (
        <TouchableWithoutFeedback onPress={handleReturn}>
          <View style={styles.focusOverlay}>
            <View
              {...panResponder.panHandlers}
              style={[
                styles.focusDragZone,
                {
                  width: dragZoneWidth,
                  height: dragZoneHeight,
                  left: (SCREEN_WIDTH - dragZoneWidth) / 2,
                  top: (SCREEN_HEIGHT - dragZoneHeight) / 2,
                },
              ]}
            />
          </View>
        </TouchableWithoutFeedback>
      )}

      {!focusedId && (
        <View style={styles.topBar} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onBack}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={24} color={theme.pillText} />
          </TouchableOpacity>

          <View style={styles.topBarRight}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleRandomItem}
            >
              <Ionicons name="shuffle-outline" size={22} color={theme.pillText} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setShowViewMenu(true)}
            >
              <Ionicons name="cube-outline" size={22} color={theme.pillText} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={onOpenFilters}
            >
              <Ionicons name="options-outline" size={22} color={theme.pillText} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!focusedId && showViewMenu && (
        <>
          <TouchableWithoutFeedback
            onPress={() => setShowViewMenu(false)}
          >
            <View style={styles.dropdownBackdrop} />
          </TouchableWithoutFeedback>

          <View style={styles.viewMenu}>
            {VIEW_MODE_OPTIONS.map((option, index) => {
              const isActive = option.value === '3d';

              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.viewMenuOption,
                    index < VIEW_MODE_OPTIONS.length - 1 &&
                      styles.viewMenuOptionBorder,
                  ]}
                  onPress={() => handleSelectViewMode(option.value)}
                >
                  <Ionicons
                    name={option.icon}
                    size={20}
                    color={isActive ? theme.accent : theme.textPrimary}
                  />

                  <Text
                    style={[
                      styles.viewMenuOptionText,
                      isActive && styles.viewMenuOptionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>

                  {isActive && (
                    <Ionicons name="checkmark" size={18} color={theme.accent} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* Hide toggle button if only 1 orientation is supported */}
      {!focusedId && supportedOrientations.length > 1 && (
        <View style={styles.controlsContainer} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.controlButton}
            onPress={handleOrientationChange}
          >
            <Ionicons
              name={
                activeOrientation === 'spine'
                  ? 'image-outline'
                  : 'book-outline'
              }
              size={22}
              color={theme.pillText}
            />

            <Text style={styles.controlText}>
              {activeOrientation === 'spine' ? 'Show Covers' : 'Show Spines'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/* ============================================================
 * STYLES
 * ============================================================ */

const getStyles = (theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  focusOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 15,
    elevation: 15,
  },
  focusDragZone: {
    position: 'absolute',
  },
  topBar: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 20,
    elevation: 20,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.pillBackground,
    borderWidth: 1,
    borderColor: theme.pillBorder,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 8,
  },
  dropdownBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.backdrop,
    zIndex: 998,
    elevation: 998,
  },
  viewMenu: {
    position: 'absolute',
    top: 102,
    right: 16,
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
    gap: 10,
  },
  viewMenuOptionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.sheetBorder,
  },
  viewMenuOptionText: {
    flex: 1,
    fontSize: 15,
    color: theme.textPrimary,
  },
  viewMenuOptionTextActive: {
    color: theme.accent,
    fontWeight: '600',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 26,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    elevation: 20,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.pillBackground,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.pillBorder,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
    elevation: 8,
  },
  controlText: {
    color: theme.pillText,
    fontSize: 14,
    fontWeight: '700',
  },
  
  /* ================================================== */
  /* FOCUSED ITEM METADATA OVERLAY STYLES               */
  /* ================================================== */
  focusedItemInfoContainer: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 25, // Sits above the focusOverlay touch catcher
    elevation: 25,
  },
  focusedItemPill: {
    backgroundColor: theme.pillBackground,
    borderWidth: 1,
    borderColor: theme.pillBorder,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    maxWidth: '80%', // Prevents overlapping the back button on small screens
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
    elevation: 8,
  },
  focusedItemTitle: {
    color: theme.pillText,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  focusedItemMeta: {
    color: theme.pillText,
    fontSize: 14,
    fontWeight: '500', 
    textAlign: 'center',
    opacity: 0.85,
  },
});