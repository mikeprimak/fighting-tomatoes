import React from 'react';

/**
 * The app's star, drawn locally.
 *
 * This is the lucide-react `Star` path (v1.7.0) — the exact icon the Rate This Fight
 * modal uses on web and mobile. Inlined rather than imported because packages/video is
 * deliberately outside the workspace and carries no UI deps; adding lucide here would
 * be a dependency for one path string.
 */
const STAR_PATH =
  'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z';

export const StarIcon: React.FC<{
  size: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}> = ({ size, fill = 'none', stroke = 'none', strokeWidth = 1.5, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke={stroke}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display: 'block', ...style }}
  >
    <path d={STAR_PATH} />
  </svg>
);
