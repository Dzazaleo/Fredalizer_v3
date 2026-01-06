import { useState, useRef, useCallback, useEffect } from 'react';
import { visionWorkerCode } from '../utils/visionWorker';

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
  const workerRef = useRef<Worker | null>(null);

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
      if (workerRef.current) {
        workerRef.current.terminate();
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const processVideo = useCallback(async (videoUrl: string, referenceImageUrl: string) => {
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

    // Terminate existing worker if any
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    // Initialize Worker
    const blob = new Blob([visionWorkerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);
    workerRef.current = worker;

    // --- Message Handler ---
    worker.onmessage = (e) => {
      const { type, payload } = e.data;
      
      switch (type) {
        case 'READY':
          // Worker is ready, start calibration
          startCalibration();
          break;
        case 'CALIBRATION_COMPLETE':
          console.log('[VisionEngine] Calibration complete:', payload);
          startVideoProcessing();
          break;
        case 'CALIBRATION_FAILED':
          console.warn('[VisionEngine] Calibration failed, using fallback.');
          startVideoProcessing();
          break;
        case 'FRAME_RESULT':
          if (payload.detected) {
            rawDetectionsRef.current.push(payload.timestamp);
          }
          break;
      }
    };

    // --- Step 1: Init Worker ---
    worker.postMessage({ type: 'INIT' });

    const startCalibration = async () => {
      if (signal.aborted) return;
      setState(prev => ({ ...prev, status: 'calibrating' }));

      try {
        const referenceImage = new Image();
        referenceImage.crossOrigin = "anonymous";
        referenceImage.src = referenceImageUrl;
        
        await new Promise((resolve, reject) => {
          referenceImage.onload = resolve;
          referenceImage.onerror = reject;
        });

        // Draw to canvas to get ImageData
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("No canvas context");

        canvas.width = referenceImage.width;
        canvas.height = referenceImage.height;
        ctx.drawImage(referenceImage, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        worker.postMessage({ type: 'CALIBRATE', payload: imageData }); // Clone payload

      } catch (err) {
        console.error("Calibration Error:", err);
        setState(prev => ({ ...prev, status: 'error' }));
      }
    };

    const startVideoProcessing = async () => {
      if (signal.aborted) return;
      setState(prev => ({ ...prev, status: 'processing' }));

      const video = videoElementRef.current!;
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      video.src = videoUrl;
      await new Promise((resolve, reject) => {
        video.onloadeddata = resolve;
        video.onerror = reject;
      });

      const processWidth = 640;
      const scale = processWidth / video.videoWidth;
      const processHeight = video.videoHeight * scale;
      canvas.width = processWidth;
      canvas.height = processHeight;

      // Processing Loop
      await new Promise<void>(async (resolve, reject) => {
        video.onended = () => resolve();
        video.onerror = (e) => reject(e);

        let frameCount = 0;
        
        const loop = (now: number, metadata: any) => {
          if (signal.aborted) {
            video.pause();
            return;
          }

          try {
            // Draw & Read
            ctx.drawImage(video, 0, 0, processWidth, processHeight);
            const imageData = ctx.getImageData(0, 0, processWidth, processHeight);
            
            // Send to Worker
            // Note: ImageData is structured cloneable, so we can pass it directly.
            // Buffers inside are copied unless we use transferables, but standard ImageData transfer is tricky across browsers.
            worker.postMessage({ 
              type: 'PROCESS_FRAME', 
              payload: { 
                imageData: imageData, 
                timestamp: metadata.mediaTime 
              } 
            });

            // Update UI Progress
            frameCount++;
            if (frameCount % 30 === 0) {
              const progress = Math.min(100, Math.round((metadata.mediaTime / video.duration) * 100));
              setState(prev => ({ ...prev, progress }));
            }

            if (!video.paused && !video.ended) {
              (video as any).requestVideoFrameCallback(loop);
            }
          } catch (e) {
            console.error("Frame loop error:", e);
          }
        };

        (video as any).requestVideoFrameCallback(loop);
        await video.play();
      });

      if (!signal.aborted) {
        const ranges = processDetections(rawDetectionsRef.current);
        setState(prev => ({ 
          ...prev, 
          status: 'completed', 
          progress: 100, 
          isProcessing: false,
          detections: ranges
        }));
        
        // Cleanup worker
        worker.terminate();
        workerRef.current = null;
      }
    };

  }, []);

  return {
    ...state,
    processVideo
  };
};