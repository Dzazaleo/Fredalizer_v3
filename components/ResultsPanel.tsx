import React from 'react';
import { Loader2, CheckCircle2, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import { DetectionRange } from '../hooks/useVisionEngine';

interface ResultsPanelProps {
  status: string;
  progress: number;
  detections: DetectionRange[];
}

export const ResultsPanel: React.FC<ResultsPanelProps> = ({ status, progress, detections }) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const calculateDuration = (start: number, end: number) => {
    return (end - start).toFixed(2) + 's';
  };

  if (status === 'idle') return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-500">
      <div className="p-6 border-b border-slate-800">
        <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          {status === 'processing' || status === 'initializing' || status === 'calibrating' ? (
            <Loader2 className="animate-spin text-blue-500" />
          ) : status === 'completed' ? (
            <CheckCircle2 className="text-green-500" />
          ) : (
            <AlertTriangle className="text-amber-500" />
          )}
          Vision Processing
        </h3>
        
        {/* Progress Bar */}
        <div className="mt-4 w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
          <div 
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out" 
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-400">
          <span className="capitalize">{status}...</span>
          <span>{progress}%</span>
        </div>
      </div>

      <div className="max-h-[300px] overflow-y-auto p-0">
        {detections.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            {status === 'completed' 
              ? 'No target sequences detected in this footage.' 
              : 'Analyzing frames...'}
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-950/50 sticky top-0 backdrop-blur-sm">
              <tr>
                <th className="px-6 py-3">Time Range</th>
                <th className="px-6 py-3">Duration</th>
                <th className="px-6 py-3">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {detections.map((range, idx) => (
                <tr key={idx} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-3 font-mono text-blue-400 flex items-center gap-2">
                    <Clock size={14} />
                    <span>{formatTime(range.start)}</span>
                    <ArrowRight size={12} className="text-slate-600" />
                    <span>{formatTime(range.end)}</span>
                  </td>
                  <td className="px-6 py-3 text-slate-300">
                    {calculateDuration(range.start, range.end)}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-500" 
                          style={{ width: `${range.confidence * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400">Match</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      {status === 'completed' && detections.length > 0 && (
        <div className="p-4 bg-slate-950 border-t border-slate-800 text-center">
          <p className="text-slate-400 text-xs">
            Identified {detections.length} removal sequences.
          </p>
        </div>
      )}
    </div>
  );
};