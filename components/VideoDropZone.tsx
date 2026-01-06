import React, { useState, useCallback, useRef } from 'react';
import { Upload, FileVideo, AlertCircle, XCircle } from 'lucide-react';
import { VideoFileHandler, UploadError } from '../types';

interface VideoDropZoneProps {
  onFileSelected: VideoFileHandler;
}

export const VideoDropZone: React.FC<VideoDropZoneProps> = ({ onFileSelected }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): boolean => {
    const validTypes = ['video/mp4', 'video/quicktime'];
    const validExtensions = ['.mp4', '.mov'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
      setError(UploadError.INVALID_TYPE);
      return false;
    }
    return true;
  };

  const processFile = useCallback((file: File) => {
    setError(null);
    if (validateFile(file)) {
      const url = URL.createObjectURL(file);
      onFileSelected(file, url);
    }
  }, [onFileSelected]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  }, [processFile]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  }, [processFile]);

  const handleZoneClick = () => {
    fileInputRef.current?.click();
  };

  const getBorderColor = () => {
    if (error) return 'border-red-500/50 bg-red-900/10';
    if (isDragging) return 'border-blue-500 bg-blue-500/10';
    return 'border-slate-700 hover:border-slate-600 bg-slate-900 hover:bg-slate-800/50';
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        onClick={handleZoneClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative group cursor-pointer
          flex flex-col items-center justify-center
          p-12 sm:p-16
          border-2 border-dashed rounded-2xl
          transition-all duration-200 ease-in-out
          ${getBorderColor()}
        `}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInputChange}
          accept="video/mp4,video/quicktime"
          className="hidden"
          aria-label="Upload video"
        />

        <div className={`
          p-4 rounded-full mb-4 transition-colors duration-200
          ${error 
            ? 'bg-red-900/30 text-red-400' 
            : isDragging 
              ? 'bg-blue-900/30 text-blue-400' 
              : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-300'
          }
        `}>
          {error ? <AlertCircle size={32} /> : <Upload size={32} />}
        </div>

        <div className="text-center space-y-2">
          <h3 className={`text-lg font-semibold ${error ? 'text-red-400' : 'text-slate-200'}`}>
            {error ? 'Upload Failed' : isDragging ? 'Drop video here' : 'Upload Video'}
          </h3>
          
          {error ? (
            <p className="text-sm text-red-400/80 max-w-xs mx-auto">{error}</p>
          ) : (
            <>
              <p className="text-slate-400 text-sm">
                Drag and drop or click to select
              </p>
              <div className="flex items-center justify-center gap-2 text-xs text-slate-500 mt-2">
                <span className="bg-slate-800 px-2 py-1 rounded">MP4</span>
                <span className="bg-slate-800 px-2 py-1 rounded">MOV</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};