import React from 'react';
import { Download, Loader2, Film, Scissors, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from './Button';
import { Range } from '../utils/ffmpegBuilder';

interface ExportControlProps {
  keepRanges: Range[];
  onExport: () => void;
  isProcessing: boolean;
  progress: number;
  status: string;
}

export const ExportControl: React.FC<ExportControlProps> = ({
  keepRanges,
  onExport,
  isProcessing,
  progress,
  status
}) => {
  if (isProcessing) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm animate-in fade-in duration-300">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg animate-pulse">
            <Loader2 size={24} className="animate-spin" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-200">Exporting Video</h3>
            <p className="text-sm text-slate-500">{status}</p>
          </div>
        </div>

        <div className="w-full bg-slate-800 rounded-full h-2 mb-2 overflow-hidden">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-end">
          <span className="text-xs text-slate-500 font-mono">{progress}%</span>
        </div>
        
        <div className="mt-4 p-3 bg-slate-950/50 rounded-lg border border-slate-800/50 text-xs text-slate-400 text-center">
          Please keep this tab open while processing.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-500/10 text-green-500 rounded-lg">
            <Film size={24} />
          </div>
          <div>
            <h3 className="font-semibold text-slate-200">Export Ready</h3>
            <p className="text-sm text-slate-500">
              {keepRanges.length} clean segments identified
            </p>
          </div>
        </div>
        {keepRanges.length > 0 && (
          <div className="bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
             <div className="flex items-center gap-2 text-xs text-slate-400">
               <Scissors size={14} />
               <span>Auto-Stitch</span>
             </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-sm text-slate-400">
          {keepRanges.length > 0 ? (
            <ul className="space-y-2">
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-blue-500" />
                <span>Smart concatenation enabled</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-blue-500" />
                <span>H.264 High Quality encoding</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-blue-500" />
                <span>Audio sync correction</span>
              </li>
            </ul>
          ) : (
            <div className="flex items-center gap-2 text-amber-500/80">
              <AlertCircle size={16} />
              <span>No clean segments to export. Run detection first.</span>
            </div>
          )}
        </div>

        <Button 
          onClick={onExport}
          className="w-full flex items-center justify-center gap-2 py-3"
          disabled={keepRanges.length === 0}
        >
          <Download size={18} />
          Export Clean Video
        </Button>
      </div>
    </div>
  );
};