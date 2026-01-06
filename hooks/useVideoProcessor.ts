import { useState, useRef, useEffect, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { buildEditCommand, Range } from '../utils/ffmpegBuilder';

interface VideoProcessorState {
  isReady: boolean;
  isProcessing: boolean;
  progress: number;
  status: string;
  error: string | null;
}

export const useVideoProcessor = () => {
  const [state, setState] = useState<VideoProcessorState>({
    isReady: false,
    isProcessing: false,
    progress: 0,
    status: 'Loading engine...',
    error: null,
  });

  const ffmpegRef = useRef<FFmpeg | null>(null);

  // Initialize FFmpeg on mount
  useEffect(() => {
    const load = async () => {
      try {
        const ffmpeg = new FFmpeg();
        ffmpegRef.current = ffmpeg;

        // Progress Listener
        ffmpeg.on('progress', ({ progress, time }) => {
          // progress is usually 0 to 1
          setState(prev => ({
            ...prev,
            progress: Math.round(progress * 100),
            status: `Rendering... ${Math.round(progress * 100)}%`
          }));
        });

        // Log Listener (Optional, good for debugging)
        ffmpeg.on('log', ({ message }) => {
          console.debug('[FFmpeg]', message);
        });

        // Load the core using Blob URLs to bypass CORS/COOP/COEP issues
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });

        setState(prev => ({ 
          ...prev, 
          isReady: true, 
          status: 'Engine Ready' 
        }));
      } catch (err) {
        console.error('FFmpeg Load Error:', err);
        setState(prev => ({ 
          ...prev, 
          isReady: false, 
          status: 'Failed to load engine',
          error: 'Could not initialize video processor. Check browser compatibility (SharedArrayBuffer).'
        }));
      }
    };

    if (!ffmpegRef.current) {
      load();
    }
  }, []);

  const processVideo = useCallback(async (file: File, ranges: Range[]): Promise<string | null> => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg || !state.isReady) {
      setState(prev => ({ ...prev, error: 'Engine not ready' }));
      return null;
    }

    setState(prev => ({ 
      ...prev, 
      isProcessing: true, 
      progress: 0, 
      error: null,
      status: 'Writing file to memory...' 
    }));

    const inputName = 'input.mp4';
    const outputName = 'output.mp4';

    try {
      // 1. Write File to MEMFS
      await ffmpeg.writeFile(inputName, await fetchFile(file));

      // 2. Build Command
      // Note: ranges passed here are the ones to KEEP
      const commandArgs = buildEditCommand(ranges, outputName);
      
      setState(prev => ({ ...prev, status: 'Processing video...' }));

      // 3. Execute
      const result = await ffmpeg.exec(commandArgs);
      
      if (result !== 0) {
        throw new Error('FFmpeg processing failed (non-zero exit code)');
      }

      // 4. Read Output
      setState(prev => ({ ...prev, status: 'Finalizing...' }));
      const data = await ffmpeg.readFile(outputName);
      
      // 5. Create Blob URL
      const blob = new Blob([data], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      return url;

    } catch (err: any) {
      console.error('Processing Error:', err);
      setState(prev => ({ 
        ...prev, 
        error: 'Video processing failed. See console for details.',
        status: 'Error' 
      }));
      return null;
    } finally {
      // 6. Cleanup Memory
      try {
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);
      } catch (e) {
        // Ignore cleanup errors (file might not exist if failed early)
      }

      setState(prev => ({ 
        ...prev, 
        isProcessing: false, 
        progress: 100,
        status: 'Completed' 
      }));
    }
  }, [state.isReady]);

  return {
    ...state,
    processVideo
  };
};