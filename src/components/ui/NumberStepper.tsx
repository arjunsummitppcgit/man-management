'use client';

import React, { useState, useEffect } from 'react';

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
  max = 9999,
  step = 1,
}: NumberStepperProps) {
  // Local string state so user can freely type (e.g. clear field, type "250")
  const [inputVal, setInputVal] = useState(String(value));

  // Keep local state in sync when parent value changes (e.g. on data load)
  useEffect(() => {
    setInputVal(String(value));
  }, [value]);

  const canDecrement = value - step >= min;
  const canIncrement = value + step <= max;

  const handleDecrement = () => {
    const next = Math.max(min, value - step);
    onChange(next);
    setInputVal(String(next));
  };

  const handleIncrement = () => {
    const next = Math.min(max, value + step);
    onChange(next);
    setInputVal(String(next));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow empty string while typing
    if (raw === '' || raw === '-') {
      setInputVal(raw);
      return;
    }
    const num = parseInt(raw, 10);
    if (!isNaN(num)) {
      setInputVal(raw);
      const clamped = Math.min(max, Math.max(min, num));
      onChange(clamped);
    }
  };

  const handleBlur = () => {
    // On blur, normalise to a valid clamped integer
    const num = parseInt(inputVal, 10);
    const safe = isNaN(num) ? min : Math.min(max, Math.max(min, num));
    setInputVal(String(safe));
    onChange(safe);
  };

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
      </label>
      <div className="flex items-center">
        {/* Decrement button */}
        <button
          type="button"
          onClick={handleDecrement}
          disabled={!canDecrement}
          className={`flex items-center justify-center w-12 h-12 rounded-l-xl border border-r-0 border-gray-200 bg-gray-100 text-teal-600 text-xl font-bold transition-all duration-150 active:scale-95 flex-shrink-0 ${
            !canDecrement ? 'opacity-30 cursor-not-allowed active:scale-100' : 'hover:bg-gray-200'
          }`}
          aria-label={`Decrease ${label}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Editable number input */}
        <input
          type="number"
          inputMode="numeric"
          value={inputVal}
          onChange={handleInputChange}
          onBlur={handleBlur}
          min={min}
          max={max}
          className="flex-1 h-12 border-y border-gray-200 bg-white text-base font-semibold text-gray-900 text-center focus:outline-none focus:bg-teal-50 focus:border-teal-400 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          aria-label={label}
        />

        {/* Increment button */}
        <button
          type="button"
          onClick={handleIncrement}
          disabled={!canIncrement}
          className={`flex items-center justify-center w-12 h-12 rounded-r-xl border border-l-0 border-gray-200 bg-gray-100 text-teal-600 text-xl font-bold transition-all duration-150 active:scale-95 flex-shrink-0 ${
            !canIncrement ? 'opacity-30 cursor-not-allowed active:scale-100' : 'hover:bg-gray-200'
          }`}
          aria-label={`Increase ${label}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
}
