import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

// Deep-link alias. Shared web URLs use the plural path
// (goodfights.app/fights/<id>); the app's fight screen lives at the singular
// /fight/[id]. When a Universal Link / App Link opens the app on /fights/<id>,
// this route forwards it to the real screen so it never lands on a dead route.
export default function FightsDeepLinkRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return <Redirect href="/" />;
  return <Redirect href={`/fight/${id}`} />;
}
