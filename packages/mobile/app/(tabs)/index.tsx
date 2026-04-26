import { Redirect } from 'expo-router';
import { useHasLiveEventWithLoading } from '../../hooks/useHasLiveEvent';
import { useAuth } from '../../store/AuthContext';

export default function Index() {
  const { user } = useAuth();
  const { hasLiveEvent, isLoading } = useHasLiveEventWithLoading();

  // Marketing demo override: force the upcoming-events screen for a single
  // account so promo screen captures always open on the targeted card.
  // Scoped by email; revert after the shoot.
  const forceUpcoming = user?.email === 'michaelsprimak@gmail.com';

  // Redirect-only route — render nothing while the live-event check resolves
  // so no placeholder UI (ActivityIndicator, default header) flashes on launch.
  if (isLoading) return null;

  return <Redirect href={!forceUpcoming && hasLiveEvent ? '/(tabs)/live-events' : '/(tabs)/events'} />;
}
