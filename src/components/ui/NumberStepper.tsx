'use client';

import React from 'react';

interface NumberStepperProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export default function NumberStepper({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
}: NumberStepperProps) {
  const canDecrement = value - step >= min;
  const canIncrement = value + step <= max;

  const handleDecrement = () => {
    if (canDecrement) {
      onChange(Math.max(min, value - step));
    }
  };

  const handleIncrement = () => {
    if (canIncrement) {
      onChange(Math.min(max, value + step));
    }
  };

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
      </label>
      <div className="flex items-center">
        <button
          type="button"
          onClick={handleDecrement}
          disabled={!canDecrement}
          className={`flex items-center justify-center w-12 h-12 rounded-l-xl border border-r-0 border-gray-200 bg-gray-100 text-teal-600 text-xl font-bold transition-all duration-150 active:scale-95 ${
            !canDecrement ? 'opacity-30 cursor-not-allowed active:scale-100' : 'hover:bg-gray-200'
          }`}
          aria-label={`Decrease ${label}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <div className="flex items-center justify-center h-12 min-w-[64px] px-4 border-y border-gray-200 bg-white text-base font-semibold text-gray-900 select-none">
          {value}
        </div>
        <button
          type="button"
          onClick={handleIncrement}
          disabled={!canIncrement}
          className={`flex items-center justify-center w-12 h-12 rounded-r-xl border border-l-0 border-gray-200 bg-gray-100 text-teal-600 text-xl font-bold transition-all duration-150 active:scale-95 ${
            !canIncrement ? 'opacity-30 cursor-not-allowed active:scale-100' : 'hover:bg-gray-200'
          }`}
          aria-label={`Increase ${label}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
