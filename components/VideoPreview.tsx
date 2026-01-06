import React from 'react';
import { X, Film, FileVideo } from 'lucide-react';
import { Button } from './Button';
import { VideoAsset } from '../types';

interface VideoPreviewProps {
  asset: VideoAsset;
  onRemove: () => void;
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({ asset, onRemove }) => {
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-slate-900 rounded-2xl shadow-sm border border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-900/30 text-blue-400 rounded-lg">
              <FileVideo size={20} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200 truncate max-w-[200px] sm:max-w-md">
                {asset.file.name}
              </h3>
              <p className="text-xs text-slate-500">{formatSize(asset.file.size)}</p>
            </div>
          </div>
          <Button variant="ghost" onClick={onRemove} className="!p-2 text-slate-500 hover:text-red-400 hover:bg-slate-800">
            <X size={20} />
          </Button>
        </div>

        {/* Video Player */}
        <div className="aspect-video bg-black relative group">
          <video 
            src={asset.previewUrl} 
            className="w-full h-full object-contain" 
            controls 
            autoPlay 
            muted
          />
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onRemove}>
          Replace Video
        </Button>
        <Button onClick={() => alert('Processing logic would go here')}>
          Process Footage
        </Button>
      </div>
    </div>
  );
};