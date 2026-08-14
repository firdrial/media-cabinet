import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Text,
  Dimensions,
} from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
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

const FOCUS_Z = 2.35;
const ANIMATION_SPEED = 0.14;
const DRAG_ROTATION_SPEED = 0.012;
const MAX_X_ROTATION = Math.PI * 0.48;
const FOCUS_ROTATION_SPEED = 0.22;

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

function TapeOnShelf({ tape, position, orientation, isFocused }) {
  const groupRef = useRef(null);
  const targetPos = useRef(new THREE.Vector3(...position));
  const targetRot = useRef(
    new THREE.Euler(0, orientation === 'spine' ? Math.PI / 2 : 0, 0)
  );
  const manualRotation = useRef({ x: 0, y: 0, z: 0 });
  const dragState = useRef({ active: false, lastX: null, lastY: null });
  const wasFocused = useRef(false);

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
    }
    wasFocused.current = isFocused;
  }, [isFocused, orientation]);

  const handlePointerDown = event => {
    if (!isFocused) return;
    event.stopPropagation();
    const coords = readPointerCoords(event);
    dragState.current = {
      active: true,
      lastX: coords ? coords.x : null,
      lastY: coords ? coords.y : null,
    };
    try { event.target.setPointerCapture?.(event.pointerId); } catch (error) {}
  };

  const handlePointerMove = event => {
    if (!isFocused || !dragState.current.active) return;
    event.stopPropagation();
    const coords = readPointerCoords(event);
    if (!coords) return;

    if (!isFiniteNumber(dragState.current.lastX) || !isFiniteNumber(dragState.current.lastY)) {
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
    try { event.target.releasePointerCapture?.(event.pointerId); } catch (error) {}
  };

  const handlePointerCancel = event => {
    event.stopPropagation();
    dragState.current.active = false;
  };

  useFrame(({ camera }) => {
    const group = groupRef.current;
    if (!group) return;

    if (isFocused) {
      targetPos.current.set(camera.position.x, 0, FOCUS_Z);
      const m = manualRotation.current;
      if (!isFiniteNumber(m.x) || !isFiniteNumber(m.y) || !isFiniteNumber(m.z)) {
        manualRotation.current = { x: 0, y: 0, z: 0 };
      }
    } else {
      targetPos.current.set(...position);
      targetRot.current.set(0, orientation === 'spine' ? Math.PI / 2 : 0, 0);
    }

    if (!isFiniteNumber(group.position.x) || !isFiniteNumber(group.position.y) || !isFiniteNumber(group.position.z)) {
      group.position.copy(targetPos.current);
    } else {
      group.position.lerp(targetPos.current, ANIMATION_SPEED);
    }

    const rotTarget = isFocused ? manualRotation.current : targetRot.current;
    if (!isFiniteNumber(group.rotation.x) || !isFiniteNumber(group.rotation.y) || !isFiniteNumber(group.rotation.z)) {
      group.rotation.set(rotTarget.x, rotTarget.y, rotTarget.z);
    } else {
      const speed = isFocused ? FOCUS_ROTATION_SPEED : ANIMATION_SPEED;
      group.rotation.x += (rotTarget.x - group.rotation.x) * speed;
      group.rotation.y += (rotTarget.y - group.rotation.y) * speed;
      group.rotation.z += (rotTarget.z - group.rotation.z) * speed;
    }
  });

  return (
    <group
      ref={groupRef}
      position={position}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <VHSTape textureMap={tape.textureMap} />
    </group>
  );
}

/* ============================================================
 * CHEAP PLACEHOLDER
 * ============================================================ */

function PlaceholderTape({ position, orientation }) {
  const width = orientation === 'cover' ? VHS_W : VHS_D;
  return (
    <group position={position} rotation={[0, orientation === 'spine' ? Math.PI / 2 : 0, 0]}>
      <mesh>
        <boxGeometry args={[width, VHS_H, VHS_D]} />
        <meshStandardMaterial color="#211815" roughness={0.85} />
      </mesh>
    </group>
  );
}

/* ============================================================
 * 3D SCENE
 * ============================================================ */

function ShelfScene({ items, orientation, focusedId, scrollX }) {
  const { camera } = useThree();
  const controlsRef = useRef(null);

  const cameraX = scrollX / PIXELS_PER_UNIT;
  const spacing = getSpacing(orientation);
  const screenUnits = SCREEN_WIDTH / PIXELS_PER_UNIT;
  const hVisibleUnits = screenUnits / 2 + H_VISIBLE_MARGIN;

  useEffect(() => {
    if (focusedId) return;
    camera.position.x = cameraX;
    camera.position.y = 0;
    if (controlsRef.current) {
      controlsRef.current.target.set(cameraX, 0, 0);
      controlsRef.current.update();
    }
  }, [cameraX, camera, focusedId]);

  useEffect(() => {
    if (!focusedId) {
      camera.position.z = 5;
    }
  }, [focusedId, camera]);

  return (
    <>
      <ambientLight intensity={0.68} />
      <directionalLight position={[5, 8, 6]} intensity={0.95} />
      <directionalLight position={[-5, 2, 4]} intensity={0.35} />
      <pointLight position={[0, 3, 3]} intensity={0.25} distance={12} />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan={false}
        enableZoom={!!focusedId}
        enableRotate={false}
        enableDamping
        dampingFactor={0.06}
        zoomSpeed={1.25}
        minDistance={1.5}
        maxDistance={8}
        target={[cameraX, 0, 0]}
      />

      {items.map((tape, tapeIndex) => {
        const wx = tapeIndex * spacing;
        const visibleX = Math.abs(wx - cameraX) < hVisibleUnits;

        if (!visibleX && focusedId !== tape.id) {
          return (
            <PlaceholderTape
              key={tape.id}
              position={[wx, 0, 0]}
              orientation={orientation}
            />
          );
        }

        return (
          <TapeOnShelf
            key={tape.id}
            tape={tape}
            position={[wx, 0, 0]}
            orientation={orientation}
            isFocused={focusedId === tape.id}
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
        const left = (SCREEN_WIDTH / 2) + (tapeIndex * spacingPx) - (spacingPx / 2);
        const top = (SCREEN_HEIGHT / 2) - (tapeHitHeight / 2);

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

export default function ShelfView3D({ items, onBack, onViewModeChange, onOpenFilters }) {
  const [orientation, setOrientation] = useState('spine');
  const [focusedId, setFocusedId] = useState(null);
  const [scrollX, setScrollX] = useState(0);
  const [showViewMenu, setShowViewMenu] = useState(false);

  const spacingPx = getSpacing(orientation) * PIXELS_PER_UNIT;
  const maxCameraX = Math.max(0, (items.length - 1) * getSpacing(orientation));
  const scrollableWidthPx = maxCameraX * PIXELS_PER_UNIT;
  const contentWidth = SCREEN_WIDTH + scrollableWidthPx;
  const contentHeight = SCREEN_HEIGHT;

  useEffect(() => {
    if (focusedId && !items.some(item => item.id === focusedId)) {
      setFocusedId(null);
    }
  }, [items, focusedId]);

  const handleOrientationChange = () => {
    if (focusedId) return;
    setOrientation(current => (current === 'spine' ? 'cover' : 'spine'));
    setScrollX(0);
  };

  const handleFocus = id => setFocusedId(id);
  const handleReturn = () => setFocusedId(null);

  const handleSelectViewMode = value => {
    setShowViewMenu(false);
    if (onViewModeChange) onViewModeChange(value);
  };

  return (
    <View style={styles.container}>
      <Canvas
        onPointerMissed={handleReturn}
        pointerEvents={focusedId ? 'auto' : 'none'}
        camera={{ position: [0, 0, 5], fov: 50 }}
        style={StyleSheet.absoluteFill}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
      >
        <color attach="background" args={['#120c0a']} />
        <ShelfScene
          items={items}
          orientation={orientation}
          focusedId={focusedId}
          scrollX={scrollX}
        />
      </Canvas>

      {!focusedId && (
        <ScrollView
          key={`h-${orientation}`}
          horizontal
          style={StyleSheet.absoluteFill}
          contentContainerStyle={{ width: contentWidth, height: contentHeight }}
          onScroll={event => setScrollX(event.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          bounces={false}
          alwaysBounceHorizontal={false}
          directionalLockEnabled
          decelerationRate="fast"
          snapToInterval={spacingPx}
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
            <TouchableOpacity style={styles.iconButton} onPress={() => setShowViewMenu(true)}>
              <Ionicons name="cube-outline" size={22} color="#ffffff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={onOpenFilters}>
              <Ionicons name="options-outline" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!focusedId && showViewMenu && (
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
                  index < VIEW_MODE_OPTIONS.length - 1 && styles.viewMenuOptionBorder,
                ]}
                onPress={() => handleSelectViewMode(option.value)}
              >
                <Ionicons name={option.icon} size={20} color="#ffffff" />
                <Text style={styles.viewMenuOptionText}>{option.label}</Text>
                <Ionicons name="checkmark" size={18} color="#e50914" />
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {!focusedId && (
        <View style={styles.controlsContainer} pointerEvents="box-none">
          <TouchableOpacity style={styles.controlButton} onPress={handleOrientationChange}>
            <Ionicons
              name={orientation === 'spine' ? 'image-outline' : 'book-outline'}
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
  container: { flex: 1, backgroundColor: '#120c0a' },
  topBar: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
  viewMenuOptionBorder: { borderBottomWidth: 1, borderBottomColor: '#3a2a22' },
  viewMenuOptionText: { flex: 1, fontSize: 15, color: '#ffffff' },
  controlsContainer: {
    position: 'absolute',
    bottom: 26,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
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
  controlText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
});