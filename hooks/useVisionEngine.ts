import { useState, useRef, useCallback, useEffect } from 'react';
import { calibrateReference, VisionProfile } from '../utils/visionCalibration';
import { scanFrame } from '../utils/visionDetection';

export interface DetectionRange {
  start: number;
  end: number;
  confidence: number;
}

interface VisionState {
  isProcessing: boolean;
  progress: number;
  status: 'idle' | 'initializing' | 'calibrating' | 'processing' | 'completed' | 'error';
  detections: DetectionRange[];
}

// Access global OpenCV instance
declare var cv: any;

/**
 * Groups raw timestamps into continuous ranges.
 * Assumes timestamps are sorted.
 * Tolerance: 0.5s (gaps smaller than this are merged).
 */
function processDetections(timestamps: number[]): DetectionRange[] {
  if (timestamps.length === 0) return [];

  const sorted = [...timestamps].sort((a, b) => a - b);
  const ranges: DetectionRange[] = [];
  
  let start = sorted[0];
  let prev = sorted[0];
  const TOLERANCE = 0.5;

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    if (curr - prev > TOLERANCE) {
      // Gap detected, close current range
      ranges.push({ start, end: prev, confidence: 1.0 });
      start = curr;
    }
    prev = curr;
  }
  // Close final range
  ranges.push({ start, end: prev, confidence: 1.0 });

  return ranges;
}

export const useVisionEngine = () => {
  const [state, setState] = useState<VisionState>({
    isProcessing: false,
    progress: 0,
    status: 'idle',
    detections: []
  });

  // Refs for processing loop control
  const abortControllerRef = useRef<AbortController | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Keep track of detected timestamps across the callback loop without triggering re-renders
  const rawDetectionsRef = useRef<number[]>([]);

  useEffect(() => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    videoElementRef.current = video;

    const canvas = document.createElement('canvas');
    canvasRef.current = canvas;

    return () => {
      if (videoElementRef.current) {
        videoElementRef.current.pause();
        videoElementRef.current.removeAttribute('src');
        videoElementRef.current.load();
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const processVideo = useCallback(async (videoUrl: string, referenceImageUrl: string) => {
    if (typeof cv === 'undefined') {
      console.error("OpenCV is not loaded");
      setState(prev => ({ ...prev, status: 'error' }));
      return;
    }

    // Reset State
    setState({
      isProcessing: true,
      progress: 0,
      status: 'initializing',
      detections: []
    });
    rawDetectionsRef.current = [];

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const { signal } = abortController;

    try {
      // --- Phase 1: Calibration ---
      setState(prev => ({ ...prev, status: 'calibrating' }));
      
      const referenceImage = new Image();
      referenceImage.crossOrigin = "anonymous";
      referenceImage.src = referenceImageUrl;
      
      await new Promise((resolve, reject) => {
        referenceImage.onload = resolve;
        referenceImage.onerror = reject;
      });

      if (signal.aborted) return;
      const profile: VisionProfile = calibrateReference(referenceImage);

      // --- Phase 2: Processing Loop (Frame Callback) ---
      setState(prev => ({ ...prev, status: 'processing' }));
      
      const video = videoElementRef.current!;
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error("Could not get canvas context");

      video.src = videoUrl;
      await new Promise((resolve, reject) => {
        video.onloadeddata = resolve;
        video.onerror = reject;
      });

      if (signal.aborted) return;

      // Setup Canvas for Processing (Downscaled)
      const processWidth = 640;
      const scale = processWidth / video.videoWidth;
      const processHeight = video.videoHeight * scale;
      canvas.width = processWidth;
      canvas.height = processHeight;

      // Wrap the processing in a promise that resolves when video ends
      await new Promise<void>(async (resolve, reject) => {
        video.onended = () => resolve();
        video.onerror = (e) => reject(e);

        let frameCount = 0;
        
        const processFrame = async (now: number, metadata: any) => {
          if (signal.aborted) {
            video.pause();
            return;
          }

          try {
            // 1. Draw & Read Frame
            ctx.drawImage(video, 0, 0, processWidth, processHeight);
            
            // 2. Scan (Scoped Memory Management)
            let mat: any = null;
            try {
              const imageData = ctx.getImageData(0, 0, processWidth, processHeight);
              mat = cv.matFromImageData(imageData);
              const isDetected = scanFrame(mat, profile, false); // Debug off for speed

              if (isDetected) {
                // Use metadata.mediaTime for precise timestamp
                rawDetectionsRef.current.push(metadata.mediaTime);
              }
            } finally {
              if (mat) mat.delete();
            }

            // 3. Throttle UI Updates (Every 30 frames ~ 0.5s to 1s)
            frameCount++;
            if (frameCount % 30 === 0) {
              const progress = Math.min(100, Math.round((metadata.mediaTime / video.duration) * 100));
              setState(prev => ({ ...prev, progress }));
            }

            // 4. Recursion
            // Use 'any' cast because requestVideoFrameCallback is not in all TS definitions
            if (!video.paused && !video.ended) {
              (video as any).requestVideoFrameCallback(processFrame);
            }
          } catch (e) {
            console.error("Frame processing error:", e);
          }
        };

        // Start Loop
        (video as any).requestVideoFrameCallback(processFrame);
        await video.play();
      });

      if (!signal.aborted) {
        // --- Phase 3: Finalize Ranges ---
        const ranges = processDetections(rawDetectionsRef.current);
        
        setState(prev => ({ 
          ...prev, 
          status: 'completed', 
          progress: 100, 
          isProcessing: false,
          detections: ranges
        }));
      }

    } catch (error) {
      if (!signal.aborted) {
        console.error("[VisionEngine] Processing Error:", error);
        setState(prev => ({ ...prev, status: 'error', isProcessing: false }));
      }
    }
  }, []);

  return {
    ...state,
    processVideo
  };
};