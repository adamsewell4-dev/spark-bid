import React from 'react';

type BadgeColor = 'red' | 'orange' | 'green' | 'blue' | 'purple' | 'gray';

interface BadgeProps {
  label: string;
  color?: BadgeColor;
}

const colorClasses: Record<BadgeColor, string> = {
  red: 'bg-red-100 text-red-700 ring-red-200',
  orange: 'bg-orange-100 text-orange-700 ring-orange-200',
  green: 'bg-green-100 text-green-700 ring-green-200',
  blue: 'bg-blue-100 text-blue-700 ring-blue-200',
  purple: 'bg-purple-100 text-purple-700 ring-purple-200',
  gray: 'bg-gray-100 text-gray-600 ring-gray-200',
};

export function Badge({ label, color = 'gray' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${colorClasses[color]}`}
    >
      {label}
    </span>
  );
}
