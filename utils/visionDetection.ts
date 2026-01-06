import { VisionProfile } from './visionCalibration';

// Access global OpenCV instance
declare var cv: any;

/**
 * Scans a frame using strict Spatial Locking (Projected) and Color Triad verification.
 * 
 * Logic:
 * 1. Project Normalized Reference Box onto current Frame dimensions.
 * 2. Find candidates using MENU_DARK (Background).
 * 3. SPATIAL LOCK: Check Intersection over Union (IoU) > 0.3.
 * 4. TRIAD CHECK: Confirm presence of MENU_LIGHT and TEXT_WHITE (> 1% density).
 * 
 * Memory Management:
 * - Treats srcFrame as READ ONLY (never deleted).
 * - Strictly deletes all internal Mats in a finally block.
 */
export function scanFrame(srcFrame: any, profile: VisionProfile, debugMode: boolean = false): boolean {
  if (typeof cv === 'undefined') return false;

  let detected = false;

  // --- Mats to cleanup (Function Scope) ---
  let hsv: any = null;
  let maskDark: any = null;
  let contours: any = null;
  let hierarchy: any = null;
  
  // Color bounds matrices
  let lowP: any = null;
  let highP: any = null;

  // --- Mats to cleanup (Loop Scope, managed carefully) ---
  let roi: any = null;
  let maskLight: any = null;
  let maskWhite: any = null;
  let lowL: any = null;
  let highL: any = null;
  let lowW: any = null;
  let highW: any = null;

  try {
    const fw = srcFrame.cols;
    const fh = srcFrame.rows;

    // --- Step 1: Projection (Resolution Independence) ---
    const nb = profile.spatial.normalizedBox;
    const expectedRect = {
      x: Math.floor(nb.x * fw),
      y: Math.floor(nb.y * fh),
      width: Math.floor(nb.w * fw),
      height: Math.floor(nb.h * fh)
    };

    // --- Step 2: Background Segmentation ---
    hsv = new cv.Mat();
    cv.cvtColor(srcFrame, hsv, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

    // Create threshold scalars/mats for Background
    lowP = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), profile.bounds.dark.lower);
    highP = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), profile.bounds.dark.upper);
    maskDark = new cv.Mat();
    
    cv.inRange(hsv, lowP, highP, maskDark);

    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(maskDark, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // --- Step 3: Spatial Lock & Verification Loop ---
    for (let i = 0; i < contours.size(); ++i) {
      const contour = contours.get(i);
      const rect = cv.boundingRect(contour);
      
      const iou = calculateIoU(rect, expectedRect);

      // Relaxed Rule: IoU > 0.3 (30% overlap)
      if (iou < 0.3) {
        continue; // Next contour
      }

      if (debugMode) {
        console.log(`[Detection] Spatial Match! IoU: ${iou.toFixed(2)} at [${rect.x}, ${rect.y}]`);
      }

      // --- Step 4: Triad Check (ROI) ---
      // Inner try/finally to ensure loop resources are cleaned even if logic throws or we break
      try {
        roi = hsv.roi(rect);
        const area = rect.width * rect.height;

        // Check A: Menu Light
        lowL = new cv.Mat(roi.rows, roi.cols, roi.type(), profile.bounds.light.lower);
        highL = new cv.Mat(roi.rows, roi.cols, roi.type(), profile.bounds.light.upper);
        maskLight = new cv.Mat();
        cv.inRange(roi, lowL, highL, maskLight);
        
        const lightCount = cv.countNonZero(maskLight);
        const lightRatio = lightCount / area;

        // Check B: Text White
        lowW = new cv.Mat(roi.rows, roi.cols, roi.type(), profile.bounds.white.lower);
        highW = new cv.Mat(roi.rows, roi.cols, roi.type(), profile.bounds.white.upper);
        maskWhite = new cv.Mat();
        cv.inRange(roi, lowW, highW, maskWhite);

        const whiteCount = cv.countNonZero(maskWhite);
        const whiteRatio = whiteCount / area;

        if (debugMode) {
          console.log(`[Detection] Triad Density - Light: ${(lightRatio*100).toFixed(2)}%, White: ${(whiteRatio*100).toFixed(2)}%`);
        }

        if (lightRatio > 0.01 && whiteRatio > 0.01) {
          detected = true;
          // Break, but cleanup happens in finally block below before next iteration logic or exit
        }

      } catch (err) {
        console.warn("ROI Detection Error", err);
      } finally {
        // Strict Cleanup for Loop Vars
        if (maskLight) { maskLight.delete(); maskLight = null; }
        if (maskWhite) { maskWhite.delete(); maskWhite = null; }
        if (lowL) { lowL.delete(); lowL = null; }
        if (highL) { highL.delete(); highL = null; }
        if (lowW) { lowW.delete(); lowW = null; }
        if (highW) { highW.delete(); highW = null; }
        if (roi) { roi.delete(); roi = null; }
      }

      if (detected) break;
    }

  } catch (err) {
    console.error("scanFrame Error", err);
  } finally {
    // --- Final Cleanup ---
    // Note: We DO NOT delete srcFrame here. It belongs to the caller.
    
    if (hsv) hsv.delete();
    if (maskDark) maskDark.delete();
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
    if (lowP) lowP.delete();
    if (highP) highP.delete();
    
    // Safety check: Ensure loop vars are gone if the loop exited weirdly
    if (roi) roi.delete();
    if (maskLight) maskLight.delete();
    if (maskWhite) maskWhite.delete();
    if (lowL) lowL.delete();
    if (highL) highL.delete();
    if (lowW) lowW.delete();
    if (highW) highW.delete();
  }

  return detected;
}

/**
 * Calculates Intersection over Union (IoU) between two rectangles.
 */
function calculateIoU(rectA: any, rectB: any): number {
  const xA = Math.max(rectA.x, rectB.x);
  const yA = Math.max(rectA.y, rectB.y);
  const xB = Math.min(rectA.x + rectA.width, rectB.x + rectB.width);
  const yB = Math.min(rectA.y + rectA.height, rectB.y + rectB.height);

  const interW = Math.max(0, xB - xA);
  const interH = Math.max(0, yB - yA);
  
  if (interW <= 0 || interH <= 0) return 0;

  const interArea = interW * interH;
  const areaA = rectA.width * rectA.height;
  const areaB = rectB.width * rectB.height;

  const unionArea = areaA + areaB - interArea;
  return unionArea > 0 ? interArea / unionArea : 0;
}