// Access global OpenCV instance
declare var cv: any;

export interface VisionProfile {
  // Pre-calculated HSV bounds for the Triad Check
  bounds: {
    dark: { lower: number[]; upper: number[] };
    light: { lower: number[]; upper: number[] };
    white: { lower: number[]; upper: number[] };
  };
  // Spatial Template for Position Locking (Normalized 0.0 - 1.0)
  spatial: {
    normalizedBox: { x: number; y: number; w: number; h: number };
    aspectRatio: number;
  };
}

// Hardcoded Robust Colors (RGB)
const TARGET_COLORS = {
  MENU_DARK: [14, 4, 49],   // Deep Purple Background
  MENU_LIGHT: [50, 4, 139], // Lighter Purple Selection Bar
  TEXT_WHITE: [255, 255, 255]
};

interface HSVRange {
  lower: number[];
  upper: number[];
}

/**
 * Helper to convert RGB to OpenCV HSV (H: 0-180, S: 0-255, V: 0-255)
 * Adds tolerances to create a detection range.
 */
function getHsvRange(rgb: number[], tolerance = { h: 10, s: 40, v: 40 }): HSVRange {
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta === 0) h = 0;
  else if (max === r) h = 60 * (((g - b) / delta) % 6);
  else if (max === g) h = 60 * (((b - r) / delta) + 2);
  else if (max === b) h = 60 * (((r - g) / delta) + 4);

  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  // Convert to OpenCV scale
  const cvH = h / 2;       // 0-180
  const cvS = s * 255;     // 0-255
  const cvV = v * 255;     // 0-255

  // Apply tolerance
  const lower = [
    Math.max(0, cvH - tolerance.h),
    Math.max(0, cvS - tolerance.s),
    Math.max(0, cvV - tolerance.v),
    0
  ];

  const upper = [
    Math.min(180, cvH + tolerance.h),
    Math.min(255, cvS + tolerance.s),
    Math.min(255, cvV + tolerance.v),
    255
  ];

  return { lower, upper };
}

/**
 * Analyzes a Reference Screenshot to create a Spatial & Color Profile.
 * 
 * Algorithm:
 * 1. Convert Image to HSV.
 * 2. Filter for MENU_DARK to find the menu body.
 * 3. Extract geometric properties and NORMALIZE them (0.0-1.0).
 * 4. Package with pre-calculated color bounds for detection.
 */
export function calibrateReference(image: HTMLImageElement): VisionProfile {
  if (typeof cv === 'undefined') {
    throw new Error("OpenCV is not loaded yet.");
  }

  // 1. Prepare Color Bounds (Robust Tolerances)
  // Dark Purple: Wide tolerance for low-light volatility
  const darkBounds = getHsvRange(TARGET_COLORS.MENU_DARK, { h: 20, s: 50, v: 50 });
  
  // Light Purple: Standard tolerance
  const lightBounds = getHsvRange(TARGET_COLORS.MENU_LIGHT, { h: 15, s: 50, v: 50 });
  
  // White: Low Saturation (<30), High Value (>200)
  const whiteBounds = {
    lower: [0, 0, 200, 0],
    upper: [180, 30, 255, 255]
  };

  const src = cv.imread(image);
  const hsv = new cv.Mat();
  const mask = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  // Debug Telemetry: Resolution
  console.log(`[Calibration] Reference Res: ${src.cols}x${src.rows}`);

  let spatial = {
    normalizedBox: { x: 0, y: 0, w: 0, h: 0 },
    aspectRatio: 0
  };

  try {
    cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

    // Filter MENU_DARK
    const lowScalar = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), darkBounds.lower);
    const highScalar = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), darkBounds.upper);
    
    cv.inRange(hsv, lowScalar, highScalar, mask);
    lowScalar.delete();
    highScalar.delete();

    // Find largest contour
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let maxArea = 0;
    let bestRect = null;

    for (let i = 0; i < contours.size(); ++i) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area > maxArea) {
        maxArea = area;
        bestRect = cv.boundingRect(cnt);
      }
    }

    const totalPixels = src.cols * src.rows;
    // Threshold: 1% of screen area to be considered a menu
    if (bestRect && maxArea > (totalPixels * 0.01)) {
      
      // Log Detected Box (Pixels)
      console.log(`[Calibration] Detected Menu Box: x=${bestRect.x}, y=${bestRect.y}, w=${bestRect.width}, h=${bestRect.height}`);

      // CRITICAL: Normalization
      spatial = {
        normalizedBox: {
          x: bestRect.x / src.cols,
          y: bestRect.y / src.rows,
          w: bestRect.width / src.cols,
          h: bestRect.height / src.rows
        },
        aspectRatio: bestRect.width / bestRect.height
      };

      // Log Normalized Profile
      console.log(`[Calibration] Normalized Profile: x=${spatial.normalizedBox.x.toFixed(4)}, y=${spatial.normalizedBox.y.toFixed(4)}, w=${spatial.normalizedBox.w.toFixed(4)}, h=${spatial.normalizedBox.h.toFixed(4)}`);

    } else {
      console.error(`[Calibration] FAILED. Max Area: ${maxArea} (Threshold: ${totalPixels * 0.01})`);
      throw new Error("Calibration failed: Could not detect the menu box in the reference image.");
    }

  } catch (e) {
    console.error("Calibration Error:", e);
    throw e;
  } finally {
    src.delete();
    hsv.delete();
    mask.delete();
    contours.delete();
    hierarchy.delete();
  }

  return {
    bounds: {
      dark: darkBounds,
      light: lightBounds,
      white: whiteBounds
    },
    spatial
  };
}