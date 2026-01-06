import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ImagePlus, ScanSearch, X, AlertCircle } from 'lucide-react';
import { ReferenceImageHandler } from '../types';

interface ReferenceImageDropZoneProps {
  onImageLoaded: ReferenceImageHandler;
}

export const ReferenceImageDropZone: React.FC<ReferenceImageDropZoneProps> = ({ onImageLoaded }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup memory on unmount or url change
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const processFile = (file: File) => {
    setError(null);

    // Validate Image Type
    const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Invalid format. Please upload a PNG or JPG screenshot.');
      return;
    }

    // Revoke old URL to free memory if it exists
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    
    // Pass up to parent for VisionEngine consumption
    onImageLoaded(file, url);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  }, [previewUrl]);

  const clearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewUrl(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="w-full">
      {/* Label / Header */}
      <div className="flex items-center gap-2 mb-3 text-slate-400">
        <ScanSearch className="w-4 h-4 text-purple-400" />
        <span className="text-xs font-semibold uppercase tracking-wider">Detection Fingerprint</span>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl transition-all duration-200 cursor-pointer overflow-hidden
          flex flex-col items-center justify-center h-48 bg-slate-900
          ${isDragging 
            ? 'border-purple-500 bg-purple-500/10' 
            : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800'
          }
          ${error ? 'border-red-500/50 bg-red-900/10' : ''}
        `}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
          accept="image/png, image/jpeg, image/webp"
          className="hidden"
        />

        {previewUrl ? (
          <div className="relative w-full h-full group">
            {/* Image Preview */}
            <img 
              src={previewUrl} 
              alt="Reference Fingerprint" 
              className="w-full h-full object-contain p-2"
            />
            
            {/* Overlay Controls */}
            <div className="absolute inset-0 bg-black/50 group-hover:bg-black/70 transition-colors flex items-center justify-center gap-4">
              <span className="text-white font-medium text-sm opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md">
                Target Acquired
              </span>
              <button 
                onClick={clearSelection}
                className="opacity-0 group-hover:opacity-100 p-2 bg-slate-800 text-red-400 hover:bg-slate-700 rounded-full transition-all shadow-lg"
                title="Remove image"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center p-6 pointer-events-none">
            <div className={`p-3 rounded-full mb-3 transition-colors ${isDragging ? 'bg-purple-900/30 text-purple-400' : 'bg-slate-800 text-slate-500'}`}>
              <ImagePlus className="w-6 h-6" />
            </div>
            <p className={`text-sm font-medium ${isDragging ? 'text-purple-400' : 'text-slate-400'}`}>
              Upload Menu Screenshot
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-[200px]">
              The VisionEngine will search for this exact image pattern.
            </p>
          </div>
        )}

        {error && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 text-red-400 text-xs bg-slate-900/95 px-3 py-1 rounded-full border border-red-900 shadow-sm">
            <AlertCircle className="w-3 h-3" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};