export const visionWorkerCode = `
self.onmessage = function(e) {
  const { type, payload } = e.data;

  switch (type) {
    case 'INIT':
      // OpenCV is loaded via importScripts in the blob context if needed, 
      // but usually we rely on the main thread or local scope.
      // In this blob setup, we wait for cv to be ready.
      if (typeof cv !== 'undefined') {
        postMessage({ type: 'READY' });
      } else {
        // Simple polling for cv if it was loaded via importScripts outside
        const checkCv = setInterval(() => {
          if (typeof cv !== 'undefined' && cv.Mat) {
            clearInterval(checkCv);
            postMessage({ type: 'READY' });
          }
        }, 100);
      }
      break;

    case 'CALIBRATE':
      handleCalibration(payload);
      break;

    case 'PROCESS_FRAME':
      handleFrame(payload);
      break;
  }
};

// State for color ranges
let lowerPurple = null; // [H, S, V, A]
let upperPurple = null;

function handleCalibration(imageData) {
  try {
    const src = cv.matFromImageData(imageData);
    const hsv = new cv.Mat();
    cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

    // Split channels to analyze Hue
    const channels = new cv.MatVector();
    cv.split(hsv, channels);
    const hue = channels.get(0);
    const sat = channels.get(1);
    
    // Calculate mean hue of saturated pixels (ignoring black/white background)
    // Threshold saturation > 50 to find "color"
    const mask = new cv.Mat();
    cv.threshold(sat, mask, 50, 255, cv.THRESH_BINARY);
    
    const mean = cv.mean(hue, mask);
    const dominantHue = mean[0]; // Hue is 0-180 in OpenCV

    // Define Range (Strict on Hue, Loose on Sat/Val)
    // Hue +/- 15 degrees
    const hMin = Math.max(0, dominantHue - 15);
    const hMax = Math.min(180, dominantHue + 15);

    // Store as global state for frame processing
    lowerPurple = [hMin, 50, 50, 0];
    upperPurple = [hMax, 255, 255, 255];

    postMessage({ 
      type: 'CALIBRATION_COMPLETE', 
      payload: { hue: dominantHue, range: [lowerPurple, upperPurple] } 
    });

    // Cleanup
    src.delete(); hsv.delete(); channels.delete(); hue.delete(); sat.delete(); mask.delete();
  } catch (err) {
    console.error('Calibration Worker Error:', err);
    // Fallback to "Slot Machine Purple" if calibration fails
    lowerPurple = [125, 50, 50, 0];
    upperPurple = [155, 255, 255, 255];
    postMessage({ type: 'CALIBRATION_FAILED' });
  }
}

function handleFrame({ imageData, timestamp }) {
  if (!lowerPurple) {
    // Default fallback if no calibration ran
    lowerPurple = [120, 50, 50, 0];
    upperPurple = [160, 255, 255, 255];
  }

  let detected = false;
  let confidence = 0;

  // Memory management is critical here
  let src = null, hsv = null, maskPurple = null, maskWhite = null, contours = null, hierarchy = null;

  try {
    src = cv.matFromImageData(imageData);
    hsv = new cv.Mat();
    
    // Convert Color Space
    cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

    // 1. Create Purple Mask (Background)
    const lowP = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), lowerPurple);
    const highP = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), upperPurple);
    maskPurple = new cv.Mat();
    cv.inRange(hsv, lowP, highP, maskPurple);
    lowP.delete(); highP.delete();

    // 2. Create White Mask (Text) -> High Value, Low Saturation
    // White in OpenCV HSV: S < 50, V > 200
    const lowW = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 0, 180, 0]);
    const highW = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180, 60, 255, 255]);
    maskWhite = new cv.Mat();
    cv.inRange(hsv, lowW, highW, maskWhite);
    lowW.delete(); highW.delete();

    // 3. Find Contours on Purple Mask
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(maskPurple, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // 4. Iterate Contours
    for (let i = 0; i < contours.size(); ++i) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      const rect = cv.boundingRect(contour);

      // Filter noise: Must be a reasonably sized box relative to frame
      // Assuming downscaled 640px width, min area ~ 2000px
      if (area > 2000) {
        
        // ROI: Look at the White Mask INSIDE this Purple Rect
        const roiWhite = maskWhite.roi(rect);
        const whitePixels = cv.countNonZero(roiWhite);
        const density = whitePixels / area;
        
        roiWhite.delete();

        // Threshold: If > 5% of the purple box is white text
        if (density > 0.05) {
          detected = true;
          confidence = density;
          break; // Stop after finding the first valid menu
        }
      }
    }
  } catch (err) {
    console.error('Worker Frame Error:', err);
  } finally {
    // Explicit Cleanup
    if (src) src.delete();
    if (hsv) hsv.delete();
    if (maskPurple) maskPurple.delete();
    if (maskWhite) maskWhite.delete();
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
  }

  postMessage({ 
    type: 'FRAME_RESULT', 
    payload: { detected, timestamp, confidence } 
  });
}
`;