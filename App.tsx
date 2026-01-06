import React, { useState, useEffect, useCallback } from 'react';
import { VideoDropZone } from './components/VideoDropZone';
import { VideoPreview } from './components/VideoPreview';
import { ReferenceImageDropZone } from './components/ReferenceImageDropZone';
import { ResultsPanel } from './components/ResultsPanel';
import { ExportControl } from './components/ExportControl';
import { VideoAsset, ReferenceAsset } from './types';
import { Clapperboard, Play, Sparkles } from 'lucide-react';
import { Button } from './components/Button';
import { useVisionEngine } from './hooks/useVisionEngine';
import { useVideoProcessor } from './hooks/useVideoProcessor';
import { Range } from './utils/ffmpegBuilder';

const App: React.FC = () => {
  const [activeAsset, setActiveAsset] = useState<VideoAsset | null>(null);
  const [referenceAsset, setReferenceAsset] = useState<ReferenceAsset | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  
  // Vision Engine Hook
  const { 
    isProcessing: isVisionProcessing, 
    progress: visionProgress, 
    status: visionStatus, 
    detections, 
    processVideo: runVision 
  } = useVisionEngine();

  // FFmpeg Processor Hook
  const {
    processVideo: exportVideo,
    isProcessing: isExporting,
    progress: exportProgress,
    status: exportStatus,
    isReady: isEngineReady
  } = useVideoProcessor();

  // Critical Memory Management: Cleanup object URL when component unmounts or asset changes
  useEffect(() => {
    return () => {
      if (activeAsset?.previewUrl) {
        URL.revokeObjectURL(activeAsset.previewUrl);
        console.log(`[Memory] Revoked Video URL: ${activeAsset.previewUrl}`);
      }
    };
  }, [activeAsset]);
  
  const handleFileSelected = useCallback((file: File, url: string) => {
    if (activeAsset) {
      URL.revokeObjectURL(activeAsset.previewUrl);
    }
    setActiveAsset({ file, previewUrl: url });

    // Capture duration for timeline calculations
    const vid = document.createElement('video');
    vid.preload = 'metadata';
    vid.src = url;
    vid.onloadedmetadata = () => {
      setVideoDuration(vid.duration);
    };
  }, [activeAsset]);

  const handleReferenceSelected = useCallback((file: File, url: string) => {
    setReferenceAsset({ file, previewUrl: url });
  }, []);

  const handleRemoveVideo = useCallback(() => {
    setActiveAsset(null); 
    setVideoDuration(0);
  }, []);

  const handleStartProcessing = () => {
    if (activeAsset && referenceAsset) {
      runVision(activeAsset.previewUrl, referenceAsset.previewUrl);
    } else {
      alert("Please upload both video footage and a reference screenshot.");
    }
  };

  /**
   * Calculates the "Keep" ranges by inverting the detection ranges.
   * Logic: The detections are the "bad" parts (menus). We want everything else.
   */
  const getKeepRanges = useCallback((): Range[] => {
    if (!videoDuration) return [];
    
    // If no detections found (and scan is complete), keep the whole video
    if (detections.length === 0) {
       return [{ start: 0, end: videoDuration }];
    }

    const sortedDetections = [...detections].sort((a, b) => a.start - b.start);
    const keep: Range[] = [];
    let currentCursor = 0;

    sortedDetections.forEach(det => {
      // Add segment before the detection if it's long enough (> 0.1s)
      if (det.start > currentCursor + 0.1) {
        keep.push({ start: currentCursor, end: det.start });
      }
      currentCursor = Math.max(currentCursor, det.end);
    });

    // Add final segment after last detection
    if (currentCursor < videoDuration - 0.1) {
      keep.push({ start: currentCursor, end: videoDuration });
    }
    
    return keep;
  }, [detections, videoDuration]);

  const handleExport = async () => {
    if (!activeAsset) return;
    
    const keepRanges = getKeepRanges();
    if (keepRanges.length === 0) {
      alert("No clean footage remaining to export.");
      return;
    }

    const blobUrl = await exportVideo(activeAsset.file, keepRanges);
    
    if (blobUrl) {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `clean_${activeAsset.file.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Optional: revoke blobUrl after a delay? handled by browser usually but good practice if stored
    }
  };

  const keepRanges = getKeepRanges();

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Navbar */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg text-white">
              <Clapperboard size={20} />
            </div>
            <h1 className="text-xl font-bold text-slate-100 tracking-tight">Studio<span className="text-blue-500">Ingest</span></h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-500">
             <div className="flex items-center gap-1">
               <span className={`w-2 h-2 rounded-full ${isEngineReady ? 'bg-green-500' : 'bg-amber-500'}`}></span>
               <span>Engine {isEngineReady ? 'Ready' : 'Loading'}</span>
             </div>
             <span>v1.2.0</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 space-y-2">
            <h2 className="text-3xl font-bold text-slate-100">
              {activeAsset ? 'Review Footage & Targets' : 'Import Source Footage'}
            </h2>
            <p className="text-slate-400 text-lg">
              {activeAsset 
                ? 'Configure your vision detection targets.' 
                : 'Upload your raw video files to begin the ingestion workflow.'}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* Left Column: Video & Results */}
            <div className="lg:col-span-2 space-y-8 transition-all duration-300">
              {activeAsset ? (
                <VideoPreview asset={activeAsset} onRemove={handleRemoveVideo} />
              ) : (
                <VideoDropZone onFileSelected={handleFileSelected} />
              )}
              
              {/* Results Section */}
              {visionStatus !== 'idle' && (
                <ResultsPanel 
                  status={visionStatus} 
                  progress={visionProgress} 
                  detections={detections} 
                />
              )}

              {/* Export Control */}
              {visionStatus === 'completed' && activeAsset && (
                 <ExportControl 
                    keepRanges={keepRanges}
                    onExport={handleExport}
                    isProcessing={isExporting}
                    progress={exportProgress}
                    status={exportStatus}
                 />
              )}
            </div>

            {/* Right Column: Reference/Configuration */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-800">
                <h3 className="font-semibold text-slate-200 mb-4">Vision Settings</h3>
                <ReferenceImageDropZone onImageLoaded={handleReferenceSelected} />
                
                <div className="mt-6 pt-6 border-t border-slate-800 space-y-4">
                  <div className="text-xs text-slate-500 space-y-2">
                    <p>
                      <span className="font-medium text-slate-400">Status:</span>{' '}
                      {activeAsset && referenceAsset 
                        ? <span className="text-green-500">Ready for processing</span> 
                        : <span className="text-amber-500">Waiting for inputs</span>
                      }
                    </p>
                    <p>
                      The engine will scan every 0.5s for the provided visual fingerprint.
                    </p>
                  </div>
                  
                  <Button 
                    className="w-full flex items-center justify-center gap-2" 
                    disabled={!activeAsset || !referenceAsset || isVisionProcessing || isExporting}
                    onClick={handleStartProcessing}
                  >
                    {isVisionProcessing ? (
                      <>Processing...</>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Run VisionEngine
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900 mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-sm text-slate-500">
          <p>&copy; {new Date().getFullYear()} StudioIngest Module. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;