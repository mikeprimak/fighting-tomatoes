import { Metadata } from 'next';
import { FightDetailClient } from './FightDetailClient';

const API_BASE_URL = process.env.API_URL || 'https://fightcrewapp-backend.onrender.com/api';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_BASE_URL}/fights/${id}`, { next: { revalidate: 300 } });
    if (!res.ok) return { title: 'Fight — Good Fights' };
    const { fight } = await res.json();
    const f1 = `${fight.fighter1.firstName} ${fight.fighter1.lastName}`;
    const f2 = `${fight.fighter2.firstName} ${fight.fighter2.lastName}`;
    const title = `${f1} vs ${f2}`;
    const desc = fight.fightStatus === 'COMPLETED'
      ? `${title} — Rated ${fight.averageRating?.toFixed(1) || 'N/A'}/10 by the community. ${fight.event?.name || ''}`
      : `${title} — ${fight.event?.name || ''} upcoming fight. See hype scores and community predictions.`;
    return {
      title: `${title} — Good Fights`,
      description: desc,
      openGraph: {
        title,
        description: desc,
        ...(fight.fighter1.profileImage ? { images: [fight.fighter1.profileImage] } : {}),
      },
    };
  } catch {
    return { title: 'Fight — Good Fights' };
  }
}

export default async function FightDetailPage({ params }: Props) {
  const { id } = await params;

  let initialFight = null;
  try {
    const res = await fetch(`${API_BASE_URL}/fights/${id}`, { next: { revalidate: 60 } });
    if (res.ok) initialFight = (await res.json()).fight;
  } catch {
    // Will load on client
  }

  return <FightDetailClient fightId={id} initialFight={initialFight} />;
}
