'use client';

import React from 'react';

interface ProgressBarProps {
  percentage: number;
  color?: string;
  height?: number;
  showLabel?: boolean;
}

export default function ProgressBar({
  percentage,
  color = '#14B8A6',
  height = 8,
  showLabel = false,
}: ProgressBarProps) {
  const clampedPercentage = Math.min(100, Math.max(0, percentage));

  return (
    <div className="w-full flex items-center gap-3">
      <div
        className="w-full bg-gray-100 overflow-hidden"
        style={{
          height: `${height}px`,
          borderRadius: `${height / 2}px`,
        }}
      >
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${clampedPercentage}%`,
            backgroundColor: color,
            borderRadius: `${height / 2}px`,
          }}
        />
      </div>
      {showLabel && (
        <span className="text-sm font-medium text-gray-600 shrink-0 min-w-[40px] text-right">
          {Math.round(clampedPercentage)}%
        </span>
      )}
    </div>
  );
}
