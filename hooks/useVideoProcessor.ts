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

  useEffect(() => {
    const load = async () => {
      try {
        const ffmpeg = new FFmpeg();
        ffmpegRef.current = ffmpeg;

        ffmpeg.on('progress', ({ progress }) => {
          setState(prev => ({
            ...prev,
            progress: Math.round(progress * 100),
            status: `Rendering... ${Math.round(progress * 100)}%`
          }));
        });

        ffmpeg.on('log', ({ message }) => {
          console.debug('[FFmpeg]', message);
        });

        // REVERTED TO SAFE CDN LOADING
        // We match the core version to the ffmpeg package version (0.12.10)
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
        
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });

        setState(prev => ({ 
          ...prev, 
          isReady: true, 
          status: 'Engine Ready' 
        }));
      } catch (err: any) {
        console.error('FFmpeg Load Error:', err);
        setState(prev => ({ 
          ...prev, 
          isReady: false, 
          status: 'Failed to load engine',
          error: `Engine Error: ${err.message || 'Check console details'}`
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
      await ffmpeg.writeFile(inputName, await fetchFile(file));
      const commandArgs = buildEditCommand(ranges, outputName);
      setState(prev => ({ ...prev, status: 'Processing video...' }));
      const result = await ffmpeg.exec(commandArgs);
      
      if (result !== 0) throw new Error('FFmpeg processing failed');

      setState(prev => ({ ...prev, status: 'Finalizing...' }));
      const data = await ffmpeg.readFile(outputName);
      const blob = new Blob([data], { type: 'video/mp4' });
      return URL.createObjectURL(blob);

    } catch (err: any) {
      console.error('Processing Error:', err);
      setState(prev => ({ 
        ...prev, 
        error: 'Video processing failed.',
        status: 'Error' 
      }));
      return null;
    } finally {
      try {
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);
      } catch (e) {}
      setState(prev => ({ 
        ...prev, 
        isProcessing: false, 
        progress: 100,
        status: 'Completed' 
      }));
    }
  }, [state.isReady]);

  return { ...state, processVideo };
};