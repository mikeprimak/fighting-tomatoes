'use client';

import { useState } from 'react';

interface FighterAvatarProps {
  src?: string | null;
  alt?: string;
  /** Initials to show when there is no image or the image fails to load. */
  initials: string;
  /** Classes applied to the <img> element. */
  imgClassName?: string;
  /** Classes applied to the initials fallback wrapper. */
  initialsClassName?: string;
}

/**
 * Fighter headshot with a graceful fallback to initials.
 *
 * A bare <img src={profileImage}> renders a broken-image icon when the URL is
 * non-null but dead (e.g. rotted fightingtomatoes.com headshots), because there
 * is no onError handler. This mirrors the mobile app's onError → placeholder
 * behavior: show the image when it loads, otherwise fall back to initials.
 *
 * Tracks the failed URL (not a boolean) so recycled instances in keyed lists
 * retry when handed a new src.
 */
export function FighterAvatar({
  src,
  alt = '',
  initials,
  imgClassName,
  initialsClassName,
}: FighterAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src && failedSrc !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={imgClassName}
        onError={() => setFailedSrc(src)}
      />
    );
  }

  return <div className={initialsClassName}>{initials || '?'}</div>;
}
