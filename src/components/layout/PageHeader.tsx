'use client';

import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, rightAction }: PageHeaderProps) {
  return (
    <div className="px-4 pt-2 pb-4 lg:pt-8 lg:pb-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5 lg:mt-1">{subtitle}</p>}
        </div>
        {rightAction && <div className="flex-shrink-0">{rightAction}</div>}
      </div>
    </div>
  );
}
