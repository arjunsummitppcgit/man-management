'use client';

import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  variant?: 'default' | 'glass';
}

export default function Card({
  children,
  className = '',
  onClick,
  variant = 'default',
}: CardProps) {
  const baseStyles = 'rounded-2xl p-4 transition-all duration-200';

  const variantStyles = {
    default: 'bg-white shadow-sm border border-gray-100',
    glass: 'bg-white/80 backdrop-blur-xl shadow-lg border border-white/20',
  };

  const interactiveStyles = onClick
    ? 'cursor-pointer active:scale-[0.98] hover:shadow-md'
    : '';

  return (
    <div
      className={`${baseStyles} ${variantStyles[variant]} ${interactiveStyles} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
