import React from 'react';
import { ProgressInfo } from '../lib/analyzer';
import { Activity, Clock, FileText, Image } from 'lucide-react';

interface ProgressBarProps {
  progress: ProgressInfo;
  onCancel?: () => void;
}

export function ProgressBar({ progress, onCancel }: ProgressBarProps) {
  const {
    percentComplete,
    processedImages,
    totalImages,
    processedFiles,
    totalFiles,
    estimatedTimeRemaining,
    speed,
    currentImage
  } = progress;

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className="space-y-4" role="progressbar" aria-valuenow={percentComplete} aria-valuemin={0} aria-valuemax={100}>
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center space-x-2 <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-indigo-500" />
          <span className="font-medium">Analysis Progress</span>
        </div>
        <span className="font-medium">{Math.round(percentComplete)}%</span>
      </div>

      {/* Current file */}
      <div className="text-sm text-gray-600 mb-2">
        Processing: <span className="font-medium">{currentImage}</span>
      </div>

      {/* Main progress bar */}
      <div className="relative">
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 transition-all duration-300 ease-out rounded-full"
            style={{ width: `${percentComplete}%` }}
          />
        </div>
        
        {/* Progress markers */}
        <div className="absolute -bottom-6 left-0 w-full flex justify-between text-xs text-gray-500">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-8">
        <div className="flex items-center space-x-2">
          <Image className="w-4 h-4 text-green-500" />
          <div>
            <div className="text-sm text-gray-500">Images</div>
            <div className="font-medium">
              {processedImages} / {totalImages}
            </div>
            <div className="text-xs text-gray-400">
              {speed.imagesPerSecond.toFixed(1)}/s
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4 text-blue-500" />
          <div>
            <div className="text-sm text-gray-500">Files</div>
            <div className="font-medium">
              {processedFiles} / {totalFiles}
            </div>
            <div className="text-xs text-gray-400">
              {speed.filesPerSecond.toFixed(1)}/s
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Clock className="w-4 h-4 text-amber-500" />
          <div>
            <div className="text-sm text-gray-500">Remaining</div>
            <div className="font-medium">
              {formatTime(estimatedTimeRemaining)}
            </div>
          </div>
        </div>
      </div>

      {/* Cancel button */}
      {onCancel && (
        <div className="flex justify-end mt-4">
          <button
            onClick={onCancel}
            className="px-3 py-1 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
  )
}