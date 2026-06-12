import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="rate-classics" />
      <Stack.Screen name="follow-fighters" />
      <Stack.Screen name="your-profile" />
    </Stack>
  );
}
