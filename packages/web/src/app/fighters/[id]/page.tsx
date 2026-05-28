import { Metadata } from 'next';
import { FighterDetailClient } from './FighterDetailClient';
import { formatRecord } from '@/lib/record';

const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_BASE_URL}/fighters/${id}`, { next: { revalidate: 300 } });
    if (!res.ok) return { title: 'Fighter' };
    const { fighter } = await res.json();
    const name = `${fighter.firstName} ${fighter.lastName}`;
    // Prefer the AI profile tldr (confidence-gated) for a richer, indexable
    // description; fall back to the bare record line.
    const conf = fighter.aiProfileConfidence ?? 0;
    const tldr = conf >= 0.5 ? (fighter.aiProfile?.tldr as string | undefined) : undefined;
    const record = formatRecord(fighter);
    const description = tldr
      ? `${name}: ${tldr} Fight ratings and reviews on Good Fights.`
      : `${name}${record ? ` (${record})` : ''}. See fight ratings and reviews on Good Fights.`;
    return {
      title: name,
      description,
      openGraph: {
        title: name,
        description: tldr || `${fighter.weightClass || ''}${record ? ` — ${record}` : ''}`.trim(),
        ...(fighter.profileImage ? { images: [fighter.profileImage] } : {}),
      },
    };
  } catch {
    return { title: 'Fighter' };
  }
}

export default async function FighterDetailPage({ params }: Props) {
  const { id } = await params;

  let initialFighter = null;
  try {
    const res = await fetch(`${API_BASE_URL}/fighters/${id}`, { next: { revalidate: 60 } });
    if (res.ok) initialFighter = (await res.json()).fighter;
  } catch {
    // Client will load
  }

  return <FighterDetailClient fighterId={id} initialFighter={initialFighter} />;
}
