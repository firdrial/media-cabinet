/* ============================================================
 * mediaModels.js
 *
 * Single source of truth for every physical 3D model the app
 * can scan, render, and shelve.
 *
 * Units: world units = physical mm / 100 (matches the legacy
 * VHS dimensions: 103mm -> 1.03, etc.)
 *
 * Warp outputs: pixels = physical mm * 10 (matches legacy
 * 1030x1870 etc.), except where explicitly capped for GPU
 * memory on large formats (vinyl).
 *
 * Adding a format = adding one data entry. No rendering code
 * changes unless a genuinely new *shape* (non-box) is needed.
 * ============================================================ */

const FACE_EPS = 0.0015;

/* Face order used by Media3DViewer's FACE_CONFIGS today. */
const FACE_CONFIG_ORDER = ['front', 'back', 'right', 'left', 'top', 'bottom'];

/* Capture order used by MediaScanScreen's SCAN_STEPS today. */
export const SCAN_FACE_ORDER = ['front', 'left', 'back', 'right', 'top', 'bottom'];

const DEFAULT_ROUGHNESS = {
  front: 0.38,
  back: 0.38,
  right: 0.42,
  left: 0.42,
  top: 0.5,
  bottom: 0.5,
};

/* ============================================================
 * MODEL REGISTRY
 * ============================================================ */

export const MEDIA_MODELS = {
  /* ----------------------------------------------------------
   * VHS — standard slipcase (the app's original model)
   * ---------------------------------------------------------- */
  vhs: {
    id: 'vhs',
    label: 'VHS Slipcase',
    format: 'VHS',
    caseType: 'slipcase',
    scanNoun: 'Slipcase',
    dims: { w: 1.03, h: 1.87, d: 0.25 },
    shelf: {
      orientations: ['spine', 'cover'],
      spacing: { spine: 0.28, cover: 1.1 },
    },
    faces: {
      front:  { source: 'scan', label: 'Front Cover', guideNoun: 'FRONT cover',  out: [1030, 1870] },
      left:   { source: 'scan', label: 'Left Spine',  guideNoun: 'LEFT SPINE',   out: [250, 1870] },
      back:   { source: 'scan', label: 'Back Cover',  guideNoun: 'BACK cover',   out: [1030, 1870] },
      right:  { source: 'scan', label: 'Right Spine', guideNoun: 'RIGHT SPINE',  out: [250, 1870] },
      top:    { source: 'scan', label: 'Top Flap',    guideNoun: 'TOP FLAP',     out: [1030, 250] },
      bottom: { source: 'scan', label: 'Bottom Edge', guideNoun: 'BOTTOM EDGE',  out: [1030, 250] },
    },
  },

  /* ----------------------------------------------------------
   * VHS — double slipcase (two cassettes, double depth)
   * ---------------------------------------------------------- */
  vhsDouble: {
    id: 'vhsDouble',
    label: 'VHS Double',
    format: 'VHS',
    caseType: 'double',
    scanNoun: 'Slipcase',
    dims: { w: 1.03, h: 1.87, d: 0.5 },
    shelf: {
      orientations: ['spine', 'cover'],
      spacing: { spine: 0.53, cover: 1.1 },
    },
    faces: {
      front:  { source: 'scan', label: 'Front Cover', guideNoun: 'FRONT cover',  out: [1030, 1870] },
      left:   { source: 'scan', label: 'Left Spine',  guideNoun: 'LEFT SPINE',   out: [500, 1870] },
      back:   { source: 'scan', label: 'Back Cover',  guideNoun: 'BACK cover',   out: [1030, 1870] },
      right:  { source: 'scan', label: 'Right Spine', guideNoun: 'RIGHT SPINE',  out: [500, 1870] },
      top:    { source: 'scan', label: 'Top Flap',    guideNoun: 'TOP FLAP',     out: [1030, 500] },
      bottom: { source: 'scan', label: 'Bottom Edge', guideNoun: 'BOTTOM EDGE',  out: [1030, 500] },
    },
  },

  /* ----------------------------------------------------------
   * CD — standard jewel case (142 x 125 x 10 mm)
   * ---------------------------------------------------------- */
  cd: {
    id: 'cd',
    label: 'CD Jewel Case',
    format: 'CD',
    caseType: 'jewel',
    scanNoun: 'CD Case',
    dims: { w: 1.42, h: 1.25, d: 0.1 }, // 142mm wide, 125mm tall, 10mm deep
    shelf: {
      orientations: ['spine', 'cover'],
      spacing: { spine: 0.13, cover: 1.50 }, // Cover spacing updated for the wider face
    },
    faces: {
      front:  { source: 'scan', label: 'Front Cover', guideNoun: 'FRONT cover',  out: [1420, 1250] },
      left:   { source: 'scan', label: 'Left Spine',  guideNoun: 'LEFT SPINE',   out: [100, 1250] },
      back:   { source: 'scan', label: 'Back Cover',  guideNoun: 'BACK cover',   out: [1420, 1250] },
      right:  { source: 'scan', label: 'Right Spine', guideNoun: 'RIGHT SPINE',  out: [100, 1250] },
      top:    { source: 'scan', label: 'Top Edge',    guideNoun: 'TOP EDGE',     out: [1420, 100] },
      bottom: { source: 'scan', label: 'Bottom Edge', guideNoun: 'BOTTOM EDGE',  out: [1420, 100] },
    },
  },

  /* ----------------------------------------------------------
   * Blu-Ray — standard keep case (~135 x 171 x 13 mm,
   * industry-standard values; verify against a physical case)
   * ---------------------------------------------------------- */
  bluray: {
    id: 'bluray',
    label: 'Blu-Ray Case',
    format: 'Blu-Ray',
    caseType: 'keep',
    scanNoun: 'Blu-ray Case',
    dims: { w: 1.35, h: 1.71, d: 0.13 },
    shelf: {
      orientations: ['spine', 'cover'],
      spacing: { spine: 0.16, cover: 1.42 },
    },
    faces: {
      front:  { source: 'scan', label: 'Front Cover', guideNoun: 'FRONT cover',  out: [1350, 1710] },
      left:   { source: 'scan', label: 'Left Spine',  guideNoun: 'LEFT SPINE',   out: [130, 1710] },
      back:   { source: 'scan', label: 'Back Cover',  guideNoun: 'BACK cover',   out: [1350, 1710] },
      right:  { source: 'scan', label: 'Right Spine', guideNoun: 'RIGHT SPINE',  out: [130, 1710] },
      top:    { source: 'scan', label: 'Top Edge',    guideNoun: 'TOP EDGE',     out: [1350, 130] },
      bottom: { source: 'scan', label: 'Bottom Edge', guideNoun: 'BOTTOM EDGE',  out: [1350, 130] },
    },
  },

  /* ----------------------------------------------------------
   * Vinyl — 12" LP jacket (12.375" square, ~5mm thick)
   *
   * Only front + back are scanned. The four edge faces are
   * GENERATED from the scanned faces' colors, with a small
   * centered title on the left/right spines.
   * ---------------------------------------------------------- */
  vinyl: {
    id: 'vinyl',
    label: 'Vinyl LP',
    format: 'Vinyl',
    caseType: 'sleeve',
    scanNoun: 'Record Jacket',
    dims: { w: 3.14, h: 3.14, d: 0.05 },
    shelf: {
      orientations: ['cover'],
      spacing: { cover: 3.21 },
    },
    faces: {
      front: { source: 'scan', label: 'Front Cover', guideNoun: 'FRONT cover', out: [2048, 2048] },
      back:  { source: 'scan', label: 'Back Cover',  guideNoun: 'BACK cover',  out: [2048, 2048] },
      left: {
        source: 'generated',
        label: 'Left Spine',
        out: [128, 3140],
        generated: {
          kind: 'spineLabel',
          colorFrom: ['front', 'back'],
          text: { field: 'title', align: 'center', direction: 'vertical' },
        },
      },
      right: {
        source: 'generated',
        label: 'Right Spine',
        out: [128, 3140],
        generated: {
          kind: 'spineLabel',
          colorFrom: ['front', 'back'],
          text: { field: 'title', align: 'center', direction: 'vertical' },
        },
      },
      top: {
        source: 'generated',
        label: 'Top Edge',
        out: [3140, 128],
        generated: { kind: 'solid', colorFrom: ['front', 'back'] },
      },
      bottom: {
        source: 'generated',
        label: 'Bottom Edge',
        out: [3140, 128],
        generated: { kind: 'solid', colorFrom: ['front', 'back'] },
      },
    },
  },
};

export const DEFAULT_MODEL_ID = 'vhs';

/* Format -> default model, used when no explicit caseType is set. */
const FORMAT_DEFAULT_MODEL = {
  VHS: 'vhs',
  CD: 'cd',
  'Blu-Ray': 'bluray',
  Vinyl: 'vinyl',
  'Vinyl Record': 'vinyl',
};

/* ============================================================
 * ACCESSORS
 * ============================================================ */

export function getModel(modelId) {
  return MEDIA_MODELS[modelId] || MEDIA_MODELS[DEFAULT_MODEL_ID];
}

export function resolveModelId(format, caseType) {
  if (format === 'VHS' && caseType === 'double') return 'vhsDouble';
  return FORMAT_DEFAULT_MODEL[format] || DEFAULT_MODEL_ID;
}

/* Case-type choices per format (for the scan setup screen). */
export function getCaseTypes(format) {
  if (format === 'VHS') {
    return [
      { id: 'slipcase', label: 'Slipcase' },
      { id: 'double', label: 'Double' },
    ];
  }
  return null; // single case type for other formats
}

export function getScanLabel(modelId, isRescan) {
  const model = getModel(modelId);
  const noun = model.scanNoun || 'Item';
  return `${isRescan ? 'Rescan' : 'Scan'} ${noun}`;
}

/* ============================================================
 * CAMERA FRAMING (Media3DViewer + ShelfView3D focus mode)
 *
 * Single source of truth for "how far back does the camera need
 * to be to frame this model nicely." Each model may optionally
 * set a `cameraFit` override (e.g. `{ marginFactor: 1.5 }`) to
 * hand-tune just that one type without touching the shared
 * default or any other model.
 * ============================================================ */

const DEFAULT_CAMERA_FIT = {
  fovDeg: 50,          // must match the Canvas camera's fov in each viewer
  marginFactor: 1.35,  // headroom beyond the exact geometric fit
  minDistance: 3.5,    // never closer than this, regardless of size
};

export function getCameraFit(modelId) {
  const model = getModel(modelId);
  return { ...DEFAULT_CAMERA_FIT, ...(model.cameraFit || {}) };
}

/**
 * Distance the camera needs to be from the object's center so its
 * front face (width x height) fits fully inside the camera's field of
 * view, given the viewport's aspect ratio (width / height).
 *
 * Depth is intentionally excluded: these are flat, card-like objects
 * viewed mostly face-on, so fitting the full 3D bounding sphere (as if
 * someone might view them edge-on) overshoots and makes everything
 * look smaller than necessary — most noticeably on wide/square formats
 * like vinyl, where it isn't needed at all.
 *
 * Whichever axis is tighter — height against the vertical FOV, or
 * width against the narrower horizontal FOV on a portrait screen —
 * determines the distance.
 */
export function getCameraDistance(modelId, aspect) {
  const model = getModel(modelId);
  const fit = getCameraFit(modelId);

  const vFov = (fit.fovDeg * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

  const distanceForHeight = model.dims.h / 2 / Math.tan(vFov / 2);
  const distanceForWidth = model.dims.w / 2 / Math.tan(hFov / 2);

  const fitDistance = Math.max(distanceForHeight, distanceForWidth);

  return Math.max(fit.minDistance, fitDistance * fit.marginFactor);
}

/* ----------------------------------------------------------
 * 3D face configs — exact shape of Media3DViewer's FACE_CONFIGS
 * so it can be swapped in without behavior changes.
 * ---------------------------------------------------------- */

function faceSize(dims, key) {
  switch (key) {
    case 'front':
    case 'back':
      return [dims.w, dims.h];
    case 'left':
    case 'right':
      return [dims.d, dims.h];
    default: // top / bottom
      return [dims.w, dims.d];
  }
}

function faceOffset(dims, key) {
  const half =
    key === 'front' || key === 'back'
      ? dims.d / 2
      : key === 'left' || key === 'right'
      ? dims.w / 2
      : dims.h / 2;
  return half + FACE_EPS;
}

const FACE_ROTATIONS = {
  front: [0, 0, 0],
  back: [0, Math.PI, 0],
  right: [0, Math.PI / 2, 0],
  left: [0, -Math.PI / 2, 0],
  top: [-Math.PI / 2, 0, 0],
  bottom: [Math.PI / 2, 0, 0],
};

const FACE_POSITION_AXIS = {
  front: 'z',
  back: 'z',
  right: 'x',
  left: 'x',
  top: 'y',
  bottom: 'y',
};

export function getFaceConfigs(modelId) {
  const model = getModel(modelId);
  const { dims } = model;

  return FACE_CONFIG_ORDER.map(key => {
    const face = model.faces[key];
    const [width, height] = faceSize(dims, key);
    const offset = faceOffset(dims, key);
    const axis = FACE_POSITION_AXIS[key];
    const sign = key === 'back' || key === 'left' || key === 'bottom' ? -1 : 1;

    const position = [0, 0, 0];
    if (axis === 'x') position[0] = sign * offset;
    if (axis === 'y') position[1] = sign * offset;
    if (axis === 'z') position[2] = sign * offset;

    return {
      key,
      width,
      height,
      outW: face.out[0],
      outH: face.out[1],
      position,
      rotation: FACE_ROTATIONS[key],
      roughness: DEFAULT_ROUGHNESS[key],
    };
  });
}

/* ----------------------------------------------------------
 * Scan flow — exact shapes of MediaScanScreen's SCAN_STEPS
 * and WARP_OUTPUT_SIZES, filtered to scannable faces only.
 * ---------------------------------------------------------- */

export function getScanSteps(modelId) {
  const model = getModel(modelId);

  return SCAN_FACE_ORDER.filter(key => model.faces[key].source === 'scan').map(
    key => {
      const face = model.faces[key];
      const [w, h] = faceSize(model.dims, key);
      return {
        key,
        label: face.label,
        w: Math.round(w * 100),
        h: Math.round(h * 100),
        instructions: `Position the ${face.guideNoun} inside the blue box.`,
      };
    }
  );
}

export function getWarpOutputSizes(modelId) {
  const model = getModel(modelId);
  const sizes = {};
  Object.keys(model.faces).forEach(key => {
    sizes[key] = model.faces[key].out;
  });
  return sizes;
}

export function getGeneratedFaces(modelId) {
  const model = getModel(modelId);
  return Object.keys(model.faces).filter(
    key => model.faces[key].source === 'generated'
  );
}

/* ----------------------------------------------------------
 * Shelf layout helpers (ShelfView3D)
 * ---------------------------------------------------------- */

export function getSpacing(modelId, orientation) {
  const model = getModel(modelId);
  return model.shelf.spacing[orientation] ?? model.shelf.spacing.cover;
}

export function getFaceWidth(modelId, orientation) {
  const { dims } = getModel(modelId);
  return orientation === 'cover' ? dims.w : dims.d;
}

export function getShelfOrientations(modelId) {
  return getModel(modelId).shelf.orientations;
}