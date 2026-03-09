import { Stack } from 'expo-router';

export default function TopFightsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'none',
      }}
    />
  );
}
