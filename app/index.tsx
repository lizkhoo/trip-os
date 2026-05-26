import { Redirect } from 'expo-router';

export default function Index() {
  // Foundation has no consumer surface yet — start at the dev dashboard.
  return <Redirect href="/dev" />;
}
