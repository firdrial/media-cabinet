import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Text,
  Dimensions,
} from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { VHSTape } from './Tape3DViewer';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/* ============================================================
 * CONFIGURATION
 * ============================================================ */

const VHS_W = 1.03;
const VHS_H = 1.87;
const VHS_D = 0.25;

const PIXELS_PER_UNIT = 120;

const SPINE_SPACING = 0.28;
const COVER_SPACING = 1.1;

const H_VISIBLE_MARGIN = 1.0;

const DEFAULT_CAMERA_Z = 5;
const CAMERA_FOLLOW_SPEED = 16;

// Moved further back from the camera (which is at z=5) to make the tape visually smaller
const FOCUS_Z = 1.5; 
// Slowed down for a smoother, less abrupt transition
const ANIMATION_SPEED = 0.06; 
const DRAG_ROTATION_SPEED = 0.012;
const MAX_X_ROTATION = Math.PI * 0.48;
// Slowed down rotation speed
const FOCUS_ROTATION_SPEED = 0.08; 

const VIEW_MODE_OPTIONS = [
  { value: 'grid', label: 'Grid View', icon: 'grid-outline' },
  { value: 'list', label: 'List View', icon: 'list-outline' },
  { value: '3d', label: '3D View', icon: 'cube-outline' },
];

/* ============================================================
 * SHELF HELPERS
 * ============================================================ */

function getSpacing(orientation) {
  return orientation === 'cover' ? COVER_SPACING : SPINE_SPACING;
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

function readPointerCoords(event) {
  if (!event) return null;

  const nativeEvent = event.nativeEvent;

  const touch =
    nativeEvent && Array.isArray(nativeEvent.changedTouches)
      ? nativeEvent.changedTouches[0]
      : null;

  const candidates = [
    [event.clientX, event.clientY],
    nativeEvent ? [nativeEvent.locationX, nativeEvent.locationY] : null,
    nativeEvent ? [nativeEvent.pageX, nativeEvent.pageY] : null,
    touch ? [touch.locationX, touch.locationY] : null,
    touch ? [touch.pageX, touch.pageY] : null,
    event.pointer
      ? [
          event.pointer.x * SCREEN_WIDTH * 0.5,
          -event.pointer.y * SCREEN_HEIGHT * 0.5,
        ]
      : null,
  ];

  for (const pair of candidates) {
    if (pair && isFiniteNumber(pair[0]) && isFiniteNumber(pair[1])) {
      return { x: pair[0], y: pair[1] };
    }
  }

  return null;
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
}) {
  const groupRef = useRef(null);

  const targetPos = useRef(
    new THREE.Vector3(position[0], position[1], position[2])
  );

  const targetRot = useRef(
    new THREE.Euler(0, orientation === 'spine' ? Math.PI / 2 : 0, 0)
  );

  const manualRotation = useRef({ x: 0, y: 0, z: 0 });

  const dragState = useRef({
    active: false,
    lastX: null,
    lastY: null,
  });

  const wasFocused = useRef(false);

  /*
   * Localized culling state.
   * This only re-renders this individual tape when it crosses
   * the visibility threshold, instead of re-rendering the whole
   * scene on every scroll event.
   */
  const [renderFull, setRenderFull] = useState(
    () => isFocused || Math.abs(position[0]) < cullDistance
  );

  const renderFullRef = useRef(renderFull);

  useEffect(() => {
    renderFullRef.current = renderFull;
  }, [renderFull]);

  /* ----------------------------------------------------------
   * FOCUS TRANSITION
   * ---------------------------------------------------------- */

  useEffect(() => {
    if (isFocused && !wasFocused.current) {
      manualRotation.current = { x: 0, y: 0, z: 0 };
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
  }, [isFocused, orientation]);

  /* ----------------------------------------------------------
   * DRAG ROTATION
   * ---------------------------------------------------------- */

  const handlePointerDown = event => {
    if (!isFocused) return;

    event.stopPropagation();

    const coords = readPointerCoords(event);

    dragState.current = {
      active: true,
      lastX: coords ? coords.x : null,
      lastY: coords ? coords.y : null,
    };

    try {
      event.target.setPointerCapture?.(event.pointerId);
    } catch (error) {}
  };

  const handlePointerMove = event => {
    if (!isFocused || !dragState.current.active) return;

    event.stopPropagation();

    const coords = readPointerCoords(event);
    if (!coords) return;

    if (
      !isFiniteNumber(dragState.current.lastX) ||
      !isFiniteNumber(dragState.current.lastY)
    ) {
      dragState.current.lastX = coords.x;
      dragState.current.lastY = coords.y;
      return;
    }

    const deltaX = coords.x - dragState.current.lastX;
    const deltaY = coords.y - dragState.current.lastY;

    dragState.current.lastX = coords.x;
    dragState.current.lastY = coords.y;

    if (!isFiniteNumber(deltaX) || !isFiniteNumber(deltaY)) return;

    manualRotation.current.y += deltaX * DRAG_ROTATION_SPEED;

    manualRotation.current.x = clamp(
      manualRotation.current.x + deltaY * DRAG_ROTATION_SPEED,
      -MAX_X_ROTATION,
      MAX_X_ROTATION
    );
  };

  const handlePointerUp = event => {
    if (!isFocused) return;

    event.stopPropagation();
    dragState.current.active = false;

    try {
      event.target.releasePointerCapture?.(event.pointerId);
    } catch (error) {}
  };

  const handlePointerCancel = event => {
    event.stopPropagation();
    dragState.current.active = false;
  };

  /* ----------------------------------------------------------
   * FRAME ANIMATION
   * ---------------------------------------------------------- */

  useFrame(({ camera }) => {
    const group = groupRef.current;
    if (!group) return;

    const cameraX = isFiniteNumber(camera.position.x)
      ? camera.position.x
      : position[0];

    /*
     * Imperative culling check.
     * This avoids passing scrollX through React state.
     */
    const shouldRenderFull =
      isFocused || Math.abs(cameraX - position[0]) < cullDistance;

    if (shouldRenderFull !== renderFullRef.current) {
      renderFullRef.current = shouldRenderFull;
      setRenderFull(shouldRenderFull);
    }

    if (isFocused) {
      targetPos.current.set(camera.position.x, 0, FOCUS_Z);

      const m = manualRotation.current;

      if (
        !isFiniteNumber(m.x) ||
        !isFiniteNumber(m.y) ||
        !isFiniteNumber(m.z)
      ) {
        manualRotation.current = { x: 0, y: 0, z: 0 };
      }
    } else {
      targetPos.current.set(position[0], position[1], position[2]);

      targetRot.current.set(
        0,
        orientation === 'spine' ? Math.PI / 2 : 0,
        0
      );
    }

    /* Position */
    if (
      !isFiniteNumber(group.position.x) ||
      !isFiniteNumber(group.position.y) ||
      !isFiniteNumber(group.position.z)
    ) {
      group.position.copy(targetPos.current);
    } else {
      group.position.lerp(targetPos.current, ANIMATION_SPEED);
    }

    /* Rotation */
    const rotTarget = isFocused
      ? manualRotation.current
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

  const pointerProps = isFocused
    ? {
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        onPointerCancel: handlePointerCancel,
      }
    : {};

  const placeholderWidth = orientation === 'cover' ? VHS_W : VHS_D;

  return (
    <group ref={groupRef} position={position} {...pointerProps}>
      {renderFull || isFocused ? (
        <VHSTape textureMap={tape.textureMap} />
      ) : (
        <mesh>
          <boxGeometry args={[placeholderWidth, VHS_H, VHS_D]} />
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
  onReturn,
}) {
  const controlsRef = useRef(null);
  const spacing = getSpacing(orientation);

  /*
   * Camera movement is handled imperatively inside useFrame.
   * This prevents React re-renders on every scroll event.
   */
  useFrame(({ camera }, delta) => {
    const controls = controlsRef.current;

    const safeDelta = clamp(
      isFiniteNumber(delta) ? delta : 0.016,
      0.001,
      0.1
    );

    /*
     * While focused, let OrbitControls manage zoom behavior.
     * Do not force the camera back to the scroll position.
     */
    if (focusedId) {
      if (controls) {
        controls.target.set(camera.position.x, 0, 0);
        controls.update();
      }

      snapCameraRef.current = false;
      return;
    }

    const targetX = isFiniteNumber(scrollXRef.current)
      ? scrollXRef.current / PIXELS_PER_UNIT
      : 0;

    /*
     * Hard reset used for orientation changes and initialization.
     */
    if (snapCameraRef.current) {
      camera.position.set(targetX, 0, DEFAULT_CAMERA_Z);

      if (controls) {
        controls.target.set(targetX, 0, 0);
        controls.update();
      }

      snapCameraRef.current = false;
      return;
    }

    /*
     * Frame-rate independent smoothing.
     * This hides tiny JS-thread/UI-thread delays and makes
     * the camera glide instead of jitter.
     */
    const alpha = 1 - Math.exp(-CAMERA_FOLLOW_SPEED * safeDelta);

    camera.position.x = THREE.MathUtils.lerp(
      camera.position.x,
      targetX,
      alpha
    );

    camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0, alpha);

    camera.position.z = THREE.MathUtils.lerp(
      camera.position.z,
      DEFAULT_CAMERA_Z,
      alpha
    );

    if (controls) {
      controls.target.x = THREE.MathUtils.lerp(
        controls.target.x,
        targetX,
        alpha
      );

      controls.target.y = THREE.MathUtils.lerp(controls.target.y, 0, alpha);
      controls.target.z = THREE.MathUtils.lerp(controls.target.z, 0, alpha);

      controls.update();
    }
  });

  return (
    <>
      <ambientLight intensity={0.68} />

      <directionalLight position={[5, 8, 6]} intensity={0.95} />

      <directionalLight position={[-5, 2, 4]} intensity={0.35} />

      <pointLight position={[0, 3, 3]} intensity={0.25} distance={12} />

      {/* 
        Invisible backdrop to reliably catch taps outside the tape.
        React Native's WebGL implementation sometimes misses "empty space" raycasts.
        This guarantees that tapping the background registers as an interaction 
        and plays the reverse animation. 
      */}
      <mesh position={[0, 0, -5]} onPointerUp={onReturn}>
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enabled={!!focusedId}
        enablePan={false}
        enableZoom={!!focusedId}
        enableRotate={false}
        enableDamping
        dampingFactor={0.08}
        zoomSpeed={1.25}
        minDistance={1.5}
        maxDistance={8}
        target={[0, 0, 0]}
      />

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
          />
        );
      })}
    </>
  );
}

/* ============================================================
 * NATIVE HIT TARGETS
 * ============================================================ */

function ShelfHitTargets({ items, orientation, onFocus, contentWidth }) {
  const spacingPx = getSpacing(orientation) * PIXELS_PER_UNIT;
  const tapeHitHeight = VHS_H * PIXELS_PER_UNIT;

  return (
    <View style={{ width: contentWidth, height: SCREEN_HEIGHT }}>
      {items.map((tape, tapeIndex) => {
        const left =
          SCREEN_WIDTH / 2 + tapeIndex * spacingPx - spacingPx / 2;

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
              width: spacingPx,
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

  /*
   * Scroll position is stored in a ref, not state.
   * This prevents React re-renders while swiping.
   */
  const scrollXRef = useRef(0);
  const snapCameraRef = useRef(true);
  const scrollViewRef = useRef(null);

  const spacing = getSpacing(orientation);
  const spacingPx = spacing * PIXELS_PER_UNIT;

  const maxCameraX = Math.max(0, (items.length - 1) * spacing);
  const maxScrollPx = maxCameraX * PIXELS_PER_UNIT;

  const contentWidth = SCREEN_WIDTH + maxScrollPx;
  const contentHeight = SCREEN_HEIGHT;

  const cullDistance =
    SCREEN_WIDTH / PIXELS_PER_UNIT / 2 + H_VISIBLE_MARGIN;

  /* ----------------------------------------------------------
   * CLEAR INVALID FOCUS
   * ---------------------------------------------------------- */

  useEffect(() => {
    if (focusedId && !items.some(item => item.id === focusedId)) {
      setFocusedId(null);
    }
  }, [items, focusedId]);

  /* ----------------------------------------------------------
   * CLAMP SCROLL IF COLLECTION SHRINKS
   * ---------------------------------------------------------- */

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

  /* ----------------------------------------------------------
   * ORIENTATION
   * ---------------------------------------------------------- */

  const handleOrientationChange = () => {
    if (focusedId) return;

    setOrientation(current =>
      current === 'spine' ? 'cover' : 'spine'
    );

    scrollXRef.current = 0;
    snapCameraRef.current = true;
  };

  /* ----------------------------------------------------------
   * SCROLL
   * ---------------------------------------------------------- */

  const handleScroll = event => {
    const nextX = event.nativeEvent.contentOffset.x;

    scrollXRef.current = clamp(
      isFiniteNumber(nextX) ? nextX : 0,
      0,
      maxScrollPx
    );
  };

  /* ----------------------------------------------------------
   * FOCUS
   * ---------------------------------------------------------- */

  const handleFocus = id => setFocusedId(id);
  const handleReturn = () => setFocusedId(null);

  /* ----------------------------------------------------------
   * VIEW MODE
   * ---------------------------------------------------------- */

  const handleSelectViewMode = value => {
    setShowViewMenu(false);

    if (onViewModeChange) {
      onViewModeChange(value);
    }
  };

  return (
    <View style={styles.container}>
      {/* =====================================================
       * 3D CANVAS
       * ===================================================== */}

      <Canvas
        onPointerMissed={handleReturn}
        pointerEvents={focusedId ? 'auto' : 'none'}
        camera={{
          position: [0, 0, DEFAULT_CAMERA_Z],
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
          onReturn={handleReturn}
        />
      </Canvas>

      {/* =====================================================
       * HORIZONTAL SCROLL DRIVER
       * ===================================================== */}

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
        />
      </ScrollView>

      {/* =====================================================
       * TOP BAR
       * ===================================================== */}

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

      {/* =====================================================
       * VIEW MODE MENU
       * ===================================================== */}

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

      {/* =====================================================
       * ORIENTATION TOGGLE
       * ===================================================== */}

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