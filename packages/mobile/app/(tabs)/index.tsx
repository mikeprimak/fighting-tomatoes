import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useHasLiveEventWithLoading } from '../../hooks/useHasLiveEvent';

export default function Index() {
  const { hasLiveEvent, isLoading } = useHasLiveEventWithLoading();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Redirect href={hasLiveEvent ? '/(tabs)/live-events' : '/(tabs)/events'} />;
}
