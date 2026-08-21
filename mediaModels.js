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
 * MEDIA CATEGORIES
 * For context-aware API routing (e.g., TMDB vs Discogs vs IGDB)
 * ============================================================ */

export const MEDIA_CATEGORIES = {
  FILM: 'FILM',
  TELEVISION: 'TELEVISION', // <-- ADDED: For TV shows on VHS, DVD, Blu-Ray, LaserDisc
  MUSIC: 'MUSIC',
  GAME: 'GAME',
  OTHER: 'OTHER',
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
    category: MEDIA_CATEGORIES.FILM,
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
    category: MEDIA_CATEGORIES.FILM,
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
    category: MEDIA_CATEGORIES.MUSIC,
    caseType: 'jewel',
    scanNoun: 'CD Case',
    tracklistStyle: 'sequential', // Standard 1, 2, 3 numbering
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
   * DVD — standard keep case (135 x 190 x 14 mm)
   * ---------------------------------------------------------- */
  dvd: {
    id: 'dvd',
    label: 'DVD Keep Case',
    format: 'DVD',
    category: MEDIA_CATEGORIES.FILM,
    caseType: 'keep',
    scanNoun: 'Keep Case',
    dims: { w: 1.35, h: 1.90, d: 0.14 },
    shelf: {
      orientations: ['spine', 'cover'],
      spacing: { spine: 0.17, cover: 1.42 },
    },
    faces: {
      front:  { source: 'scan', label: 'Front Cover', guideNoun: 'FRONT cover',  out: [1350, 1900] },
      left:   { source: 'scan', label: 'Left Spine',  guideNoun: 'LEFT SPINE',   out: [140, 1900] },
      back:   { source: 'scan', label: 'Back Cover',  guideNoun: 'BACK cover',   out: [1350, 1900] },
      right:  { source: 'scan', label: 'Right Spine', guideNoun: 'RIGHT SPINE',  out: [140, 1900] },
      top:    { source: 'scan', label: 'Top Edge',    guideNoun: 'TOP EDGE',     out: [1350, 140] },
      bottom: { source: 'scan', label: 'Bottom Edge', guideNoun: 'BOTTOM EDGE',  out: [1350, 140] },
    },
  },

  /* ----------------------------------------------------------
   * Blu-Ray — standard keep case (~135 x 171 x 13 mm,
   * industry-standard values; verify against a physical case)
   * ---------------------------------------------------------- */
  bluray: {
    id: 'bluray',
    label: 'Blu-Ray Keep Case', // Renamed
    format: 'Blu-Ray',
    category: MEDIA_CATEGORIES.FILM,
    caseType: 'keep',
    scanNoun: 'Keep Case', // Renamed
    cornerRadius: 0.03, // 3mm physical corner radius (mm / 100)
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
   * Blu-Ray — slipcover (O-Card)
   * ---------------------------------------------------------- */
  bluraySlipcover: {
    id: 'bluraySlipcover',
    label: 'Blu-Ray Slipcover',
    format: 'Blu-Ray',
    category: MEDIA_CATEGORIES.FILM,
    caseType: 'slipcover',
    scanNoun: 'Slipcover',
    // Intentionally omitting cornerRadius so the renderer falls back to standard sharp-cornered boxGeometry
    dims: { w: 1.38, h: 1.74, d: 0.15 }, // Slightly larger to slide over the keep case
    shelf: {
      orientations: ['spine', 'cover'],
      spacing: { spine: 0.18, cover: 1.45 },
    },
    faces: {
      front:  { source: 'scan', label: 'Front Cover', guideNoun: 'FRONT cover',  out: [1380, 1740] },
      left:   { source: 'scan', label: 'Left Spine',  guideNoun: 'LEFT SPINE',   out: [150, 1740] },
      back:   { source: 'scan', label: 'Back Cover',  guideNoun: 'BACK cover',   out: [1380, 1740] },
      right:  { source: 'scan', label: 'Right Spine', guideNoun: 'RIGHT SPINE',  out: [150, 1740] },
      top:    { source: 'scan', label: 'Top Edge',    guideNoun: 'TOP EDGE',     out: [1380, 150] },
      bottom: { source: 'scan', label: 'Bottom Edge', guideNoun: 'BOTTOM EDGE',  out: [1380, 150] },
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
    category: MEDIA_CATEGORIES.MUSIC,
    caseType: 'sleeve',
    scanNoun: 'Record Jacket',
    tracklistStyle: 'sides', // A1, A2... B1, B2 numbering
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

  /* ----------------------------------------------------------
   * LaserDisc — 12" jacket (12.5" square, ~5mm thick)
   *
   * Only front + back are scanned. The four edge faces are
   * GENERATED from the scanned faces' colors, with a small
   * centered title on the left/right spines.
   * ---------------------------------------------------------- */
  laserdisc: {
    id: 'laserdisc',
    label: 'LaserDisc',
    format: 'LaserDisc',
    category: MEDIA_CATEGORIES.FILM,
    caseType: 'sleeve',
    scanNoun: 'LaserDisc Jacket',
    dims: { w: 3.17, h: 3.17, d: 0.05 }, // 12.5" square
    shelf: {
      orientations: ['cover'],
      spacing: { cover: 3.25 },
    },
    faces: {
      front: { source: 'scan', label: 'Front Cover', guideNoun: 'FRONT cover', out: [2048, 2048] },
      back:  { source: 'scan', label: 'Back Cover',  guideNoun: 'BACK cover',  out: [2048, 2048] },
      left: {
        source: 'generated',
        label: 'Left Spine',
        out: [128, 3170],
        generated: {
          kind: 'spineLabel',
          colorFrom: ['front', 'back'],
          text: { field: 'title', align: 'center', direction: 'vertical' },
        },
      },
      right: {
        source: 'generated',
        label: 'Right Spine',
        out: [128, 3170],
        generated: {
          kind: 'spineLabel',
          colorFrom: ['front', 'back'],
          text: { field: 'title', align: 'center', direction: 'vertical' },
        },
      },
      top: {
        source: 'generated',
        label: 'Top Edge',
        out: [3170, 128],
        generated: { kind: 'solid', colorFrom: ['front', 'back'] },
      },
      bottom: {
        source: 'generated',
        label: 'Bottom Edge',
        out: [3170, 128],
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
  DVD: 'dvd',
  'Blu-Ray': 'bluray',
  Vinyl: 'vinyl',
  'Vinyl Record': 'vinyl',
  LaserDisc: 'laserdisc',
  'Laser Disc': 'laserdisc',
};

/* ============================================================
 * ACCESSORS
 * ============================================================ */

export function getModel(modelId) {
  return MEDIA_MODELS[modelId] || MEDIA_MODELS[DEFAULT_MODEL_ID];
}

export function resolveModelId(format, caseType) {
  // Even if caseType is 'custom', we return the base model ID 
  // so the app knows which face templates (labels, sources) to use.
  if (format === 'VHS' && caseType === 'double') return 'vhsDouble';
  if (format === 'Blu-Ray' && caseType === 'slipcover') return 'bluraySlipcover';
  return FORMAT_DEFAULT_MODEL[format] || DEFAULT_MODEL_ID;
}

/* Case-type choices per format (for the scan setup screen). */
export function getCaseTypes(format) {
  const customPill = { id: 'custom', label: 'Custom' };

  switch (format) {
    case 'VHS':
      return [
        { id: 'slipcase', label: 'Slipcase' },
        { id: 'double', label: 'Double' },
        customPill,
      ];
    case 'Blu-Ray':
      return [
        { id: 'keep', label: 'Keep Case' },
        { id: 'slipcover', label: 'Slipcover' },
        customPill,
      ];
    case 'DVD':
      return [{ id: 'keep', label: 'Keep Case' }, customPill];
    case 'CD':
      return [{ id: 'jewel', label: 'Jewel Case' }, customPill];
    case 'Vinyl':
    case 'Vinyl Record':
      return [{ id: 'jacket', label: 'Jacket' }, customPill];
    case 'LaserDisc':
    case 'Laser Disc':
      return [{ id: 'jacket', label: 'Jacket' }, customPill];
    default:
      return [customPill]; // Fallback for any future formats
  }
}

/* Returns the media category (FILM, MUSIC, etc.) for a given model. */
export function getCategory(modelId) {
  const model = getModel(modelId);
  return model.category || MEDIA_CATEGORIES.OTHER;
}

export function getScanLabel(modelId, isRescan, customData) {
  const model = getModel(modelId);
  let noun = model.scanNoun || 'Item';
  if (customData?.caseType === 'custom') noun = 'Custom Item';
  return `${isRescan ? 'Rescan' : 'Scan'} ${noun}`;
}

/* ============================================================
 * CUSTOM DIMENSIONS HELPER
 * Intercepts the base model and recalculates dimensions and 
 * pixel outputs if customData is provided.
 * ============================================================ */

const MAX_WARP_PX = 2048; // Same GPU-safe ceiling already used for vinyl

/* Warp outputs are pixels = mm * 10, but the mobile GL/warp pipeline
 * caps at 2048px. Scale down proportionally so the aspect ratio
 * (and therefore the texture mapping) stays exact. */
function cappedWarpOut(mmW, mmH) {
  let outW = Math.round(mmW * 10);
  let outH = Math.round(mmH * 10);
  const largest = Math.max(outW, outH);
  if (largest > MAX_WARP_PX) {
    const scale = MAX_WARP_PX / largest;
    outW = Math.round(outW * scale);
    outH = Math.round(outH * scale);
  }
  return [outW, outH];
}

function getEffectiveConfig(modelId, customData) {
  console.log('🔍 [mediaModels] getEffectiveConfig fired with:', customData);
  const model = getModel(modelId);
  let dims = model.dims;
  let faces = { ...model.faces };
  let cornerRadius = model.cornerRadius;

  // If custom dimensions (in mm) are provided, override defaults
  if (customData?.customDimsMM) {
    const { w, h, d } = customData.customDimsMM;
    // Convert mm to world units (mm / 100)
    dims = { w: w / 100, h: h / 100, d: d / 100 };
    
    // Recalculate pixel outputs (mm * 10) for all faces
    Object.keys(faces).forEach(key => {
      const baseFace = faces[key];
      const [mmW, mmH] = (key === 'front' || key === 'back') ? [w, h] : 
                         (key === 'left' || key === 'right') ? [d, h] : 
                         [w, d];
      
      faces[key] = { ...baseFace, out: cappedWarpOut(mmW, mmH) };
    });
  }

  // Handle "Scan all edges" toggle for Vinyl/LaserDisc
  if (customData?.scanAllEdges && (model.format === 'Vinyl' || model.format === 'LaserDisc')) {
    // Map the generated keys to proper scanning nouns for the UI
    const edgeGuideNouns = {
      left: 'LEFT SPINE',
      right: 'RIGHT SPINE',
      top: 'TOP EDGE',
      bottom: 'BOTTOM EDGE',
    };
    
    ['left', 'right', 'top', 'bottom'].forEach(key => {
      if (faces[key]) {
        // Promote face to scannable and inject the missing guideNoun
        faces[key] = { 
          ...faces[key], 
          source: 'scan', 
          guideNoun: edgeGuideNouns[key] 
        };
      }
    });
  }

  // Force portrait scan orientation for top/bottom Vinyl/LaserDisc to avoid razor-thin guide boxes
  const isVinylOrLD = model.format === 'Vinyl' || model.format === 'LaserDisc';
  if (isVinylOrLD) {
      if (faces.top && faces.top.source === 'scan') faces.top.scanPortrait = true;
      if (faces.bottom && faces.bottom.source === 'scan') faces.bottom.scanPortrait = true;
  }

  return { model, dims, faces, cornerRadius };
}

/* ============================================================
 * CAMERA FRAMING (Media3DViewer + ShelfView3D focus mode)
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

export function getCameraDistance(modelId, aspect, customData) {
  const { dims } = getEffectiveConfig(modelId, customData);
  const fit = getCameraFit(modelId);

  const vFov = (fit.fovDeg * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

  const distanceForHeight = dims.h / 2 / Math.tan(vFov / 2);
  const distanceForWidth = dims.w / 2 / Math.tan(hFov / 2);

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

export function getFaceConfigs(modelId, customData) {
  const { dims, faces } = getEffectiveConfig(modelId, customData);

  return FACE_CONFIG_ORDER.map(key => {
    const face = faces[key];
    if (!face) return null;

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
      source: face.source, 
      scanPortrait: !!face.scanPortrait, // Expose portrait flag to renderer
    };
  }).filter(Boolean);
}

/* ----------------------------------------------------------
 * Scan flow — exact shapes of MediaScanScreen's SCAN_STEPS
 * and WARP_OUTPUT_SIZES, filtered to scannable faces only.
 * ---------------------------------------------------------- */

export function getScanSteps(modelId, customData) {
  const { dims, faces } = getEffectiveConfig(modelId, customData);

  return SCAN_FACE_ORDER.filter(key => faces[key]?.source === 'scan').map(
    key => {
      const face = faces[key];
      let [w, h] = faceSize(dims, key);
      
      // If portrait scan is required, swap the dimensions for the guide box
      if (face.scanPortrait) {
        [w, h] = [h, w];
      }

      return {
        key,
        label: face.label,
        w: Math.round(w * 100),
        h: Math.round(h * 100),
        scanPortrait: !!face.scanPortrait,
        instructions: `Position the ${face.guideNoun} inside the blue box.`,
      };
    }
  );
}

export function getWarpOutputSizes(modelId, customData) {
  const { faces } = getEffectiveConfig(modelId, customData);
  const sizes = {};
  Object.keys(faces).forEach(key => {
    sizes[key] = faces[key].out;
  });
  return sizes;
}

export function getGeneratedFaces(modelId, customData) {
  const { faces } = getEffectiveConfig(modelId, customData);
  return Object.keys(faces).filter(
    key => faces[key].source === 'generated'
  );
}

/* ----------------------------------------------------------
 * Shelf layout helpers (ShelfView3D)
 * ---------------------------------------------------------- */

export function getSpacing(modelId, orientation, customData) {
  // Use standard spacing regardless of custom dimensions to prevent weird gaps
  const model = getModel(modelId);
  return model.shelf.spacing[orientation] ?? model.shelf.spacing.cover;
}

export function getFaceWidth(modelId, orientation, customData) {
  // Must use custom dims if provided, so they don't overlap on the shelf
  const { dims } = getEffectiveConfig(modelId, customData);
  return orientation === 'cover' ? dims.w : dims.d;
}

export function getShelfOrientations(modelId, customData) {
  return getModel(modelId).shelf.orientations;
}