'use client';

import React from 'react';

/**
 * One labelled single-select of a detail table's filter bar — the batch,
 * variety and company dropdowns. `MultiPicker` beside it is the same shape for
 * the filters that take more than one answer.
 */
export default function Picker({
  id,
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  allLabel: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[11rem] px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-200"
      >
        <option value="all">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
