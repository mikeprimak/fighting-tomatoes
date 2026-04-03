import { Metadata } from 'next';
import { FighterDetailClient } from './FighterDetailClient';

const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_BASE_URL}/fighters/${id}`, { next: { revalidate: 300 } });
    if (!res.ok) return { title: 'Fighter — Good Fights' };
    const { fighter } = await res.json();
    const name = `${fighter.firstName} ${fighter.lastName}`;
    return {
      title: `${name} — Good Fights`,
      description: `${name} (${fighter.wins}-${fighter.losses}-${fighter.draws}). See fight ratings and reviews on Good Fights.`,
      openGraph: {
        title: name,
        description: `${fighter.weightClass || ''} — ${fighter.wins}-${fighter.losses}-${fighter.draws}`.trim(),
        ...(fighter.profileImage ? { images: [fighter.profileImage] } : {}),
      },
    };
  } catch {
    return { title: 'Fighter — Good Fights' };
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
