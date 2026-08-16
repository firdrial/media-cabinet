import React, { useState, useRef, useEffect } from 'react';
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
import { VHSTape } from './Tape3DViewer';
import { Ionicons } from '@expo/vector-icons';
import { getModel, resolveModelId, getCameraDistance } from './mediaModels';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/* ============================================================
 * CONFIGURATION
 * ============================================================ */

const PIXELS_PER_UNIT = 120;

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
 * INDIVIDUAL 3D TAPE
 * ============================================================ */

function TapeOnShelf({
  tape,
  position,
  orientation,
  isFocused,
  cullDistance,
  dragRotationRef,
  modelId,
  model,
  focusZ,
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
      targetPos.current.set(position[0], position[1], position[2]);

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

  const placeholderWidth = getFaceWidth(model, orientation);

  return (
    <group ref={groupRef} position={position}>
      {renderFull || isFocused ? (
        <VHSTape textureMap={tape.textureMap} modelId={modelId} />
      ) : (
        <mesh>
          <boxGeometry args={[placeholderWidth, model.dims.h, model.dims.d]} />
          <meshStandardMaterial color="#211815" roughness={0.85} />
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
  orientation,
  focusedId,
  scrollXRef,
  snapCameraRef,
  cullDistance,
  dragRotationRef,
  spacing,
  modelId,
  model,
  defaultCameraZ,
  focusZ,
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

      {items.map((tape, tapeIndex) => {
        const wx = tapeIndex * spacing;

        return (
          <TapeOnShelf
            key={tape.id}
            tape={tape}
            position={[wx, 0, 0]}
            orientation={orientation}
            isFocused={focusedId === tape.id}
            cullDistance={cullDistance}
            dragRotationRef={dragRotationRef}
            modelId={modelId}
            model={model}
            focusZ={focusZ}
          />
        );
      })}
    </>
  );
}

/* ============================================================
 * NATIVE HIT TARGETS
 * ============================================================ */

function ShelfHitTargets({ items, orientation, onFocus, contentWidth, spacingPx, model }) {
  const tapeHitHeight = model.dims.h * PIXELS_PER_UNIT;
  const hitWidth = getFaceWidth(model, orientation) * PIXELS_PER_UNIT * HIT_TARGET_WIDTH_SCALE;

  return (
    <View style={{ width: contentWidth, height: SCREEN_HEIGHT }}>
      {items.map((tape, tapeIndex) => {
        const centerX = SCREEN_WIDTH / 2 + tapeIndex * spacingPx;
        const left = centerX - hitWidth / 2;

        const top = SCREEN_HEIGHT / 2 - tapeHitHeight / 2;

        return (
          <TouchableOpacity
            key={`hit-${tape.id}`}
            activeOpacity={1}
            onPress={() => onFocus(tape.id)}
            style={{
              position: 'absolute',
              left,
              top,
              width: hitWidth,
              height: tapeHitHeight,
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
  const [orientation, setOrientation] = useState('spine');
  const [focusedId, setFocusedId] = useState(null);
  const [showViewMenu, setShowViewMenu] = useState(false);

  const scrollXRef = useRef(0);
  const snapCameraRef = useRef(true);
  const scrollViewRef = useRef(null);
  const randomTapeTimeoutRef = useRef(null);

  const dragRotationRef = useRef({ x: 0, y: 0, z: 0 });
  const dragBaseRotationRef = useRef({ x: 0, y: 0, z: 0 });

  // Derive the uniform model for the entire shelf from the first item
  const firstItem = items[0];
  const modelId = firstItem 
    ? (firstItem.modelId || firstItem.textureMap?.modelId || resolveModelId(firstItem.format, firstItem.caseType)) 
    : 'vhs';
  const model = getModel(modelId);

  // Dynamically scale camera distances based on the physical size of the media.
  const maxDim = Math.max(model.dims.w, model.dims.h, model.dims.d);
  const defaultCameraZ = maxDim * 2.7; // resting/browsing distance — unchanged, not reported as an issue

  // The camera doesn't move on focus (see ShelfScene above) — it stays at
  // defaultCameraZ, and the tape animates to focusZ. So
  // (defaultCameraZ - focusZ) is the effective camera-to-tape distance once
  // focused. getCameraDistance (mediaModels.js) is the same fit math used by
  // the standalone Tape3DViewer, so focus mode here frames each model
  // identically to the fullscreen viewer, and any per-type tuning
  // (model.cameraFit) only has to be set once, in one place.
  const screenAspect = SCREEN_WIDTH / SCREEN_HEIGHT;
  const focusZ = defaultCameraZ - getCameraDistance(modelId, screenAspect);

  const spacing = getSpacing(model, orientation);
  const spacingPx = spacing * PIXELS_PER_UNIT;

  const maxCameraX = Math.max(0, (items.length - 1) * spacing);
  const maxScrollPx = maxCameraX * PIXELS_PER_UNIT;

  const contentWidth = SCREEN_WIDTH + maxScrollPx;
  const contentHeight = SCREEN_HEIGHT;

  const cullDistance =
    SCREEN_WIDTH / PIXELS_PER_UNIT / 2 + H_VISIBLE_MARGIN;

  useEffect(() => {
    if (focusedId && !items.some(item => item.id === focusedId)) {
      setFocusedId(null);
    }
  }, [items, focusedId]);

  useEffect(() => {
    return () => {
      if (randomTapeTimeoutRef.current) {
        clearTimeout(randomTapeTimeoutRef.current);
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
    if (randomTapeTimeoutRef.current) {
      clearTimeout(randomTapeTimeoutRef.current);
      randomTapeTimeoutRef.current = null;
    }
    setFocusedId(id);
  };

  const handleReturn = () => setFocusedId(null);

  const handleRandomTape = () => {
    if (items.length === 0 || focusedId) return;

    const randomIndex = Math.floor(Math.random() * items.length);
    const randomTape = items[randomIndex];
    const targetScrollX = randomIndex * spacingPx;

    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        x: targetScrollX,
        animated: true,
      });

      if (randomTapeTimeoutRef.current) {
        clearTimeout(randomTapeTimeoutRef.current);
      }

      randomTapeTimeoutRef.current = setTimeout(() => {
        setFocusedId(randomTape.id);
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
        <color attach="background" args={['#120c0a']} />

        <ShelfScene
          items={items}
          orientation={orientation}
          focusedId={focusedId}
          scrollXRef={scrollXRef}
          snapCameraRef={snapCameraRef}
          cullDistance={cullDistance}
          dragRotationRef={dragRotationRef}
          spacing={spacing}
          modelId={modelId}
          model={model}
          defaultCameraZ={defaultCameraZ}
          focusZ={focusZ}
        />
      </Canvas>

      <ScrollView
        ref={scrollViewRef}
        key={`h-${orientation}`}
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
        snapToInterval={Math.max(spacingPx, 1)}
        snapToAlignment="start"
        disableIntervalMomentum={false}
        nestedScrollEnabled
        overScrollMode="never"
      >
        <ShelfHitTargets
          items={items}
          orientation={orientation}
          onFocus={handleFocus}
          contentWidth={contentWidth}
          spacingPx={spacingPx}
          model={model}
        />
      </ScrollView>

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
            <Ionicons name="chevron-back" size={24} color="#ffffff" />
          </TouchableOpacity>

          <View style={styles.topBarRight}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleRandomTape}
            >
              <Ionicons name="shuffle-outline" size={22} color="#ffffff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setShowViewMenu(true)}
            >
              <Ionicons name="cube-outline" size={22} color="#ffffff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={onOpenFilters}
            >
              <Ionicons name="options-outline" size={22} color="#ffffff" />
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
                    color={isActive ? '#e50914' : '#ffffff'}
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
                    <Ionicons name="checkmark" size={18} color="#e50914" />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {!focusedId && (
        <View style={styles.controlsContainer} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.controlButton}
            onPress={handleOrientationChange}
          >
            <Ionicons
              name={
                orientation === 'spine'
                  ? 'image-outline'
                  : 'book-outline'
              }
              size={22}
              color="#ffffff"
            />

            <Text style={styles.controlText}>
              {orientation === 'spine' ? 'Show Covers' : 'Show Spines'}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#120c0a',
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
    backgroundColor: 'rgba(18, 12, 10, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
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
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    zIndex: 998,
    elevation: 998,
  },

  viewMenu: {
    position: 'absolute',
    top: 102,
    right: 16,
    minWidth: 170,
    backgroundColor: '#201512',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3a2a22',
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
    borderBottomColor: '#3a2a22',
  },

  viewMenuOptionText: {
    flex: 1,
    fontSize: 15,
    color: '#ffffff',
  },

  viewMenuOptionTextActive: {
    color: '#e50914',
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
    backgroundColor: 'rgba(18, 12, 10, 0.72)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#634334',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
    elevation: 8,
  },

  controlText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});