import { Redirect } from 'expo-router';
import { useHasLiveEventWithLoading } from '../../hooks/useHasLiveEvent';

export default function Index() {
  const { hasLiveEvent, isLoading } = useHasLiveEventWithLoading();

  // Redirect-only route — render nothing while the live-event check resolves
  // so no placeholder UI (ActivityIndicator, default header) flashes on launch.
  if (isLoading) return null;

  return <Redirect href={hasLiveEvent ? '/(tabs)/live-events' : '/(tabs)/events'} />;
}
