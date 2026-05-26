import { useCallback, useEffect, useState } from 'react';
import { Tabs, useFocusEffect } from 'expo-router';
import { listPendingCandidates } from '@/services/candidates';

export default function AdminLayout() {
  const [pending, setPending] = useState(0);
  const refresh = useCallback(async () => {
    try {
      const rows = await listPendingCandidates();
      setPending(rows.length);
    } catch {
      setPending(0);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#fbf7f0' },
        headerTitleStyle: { fontFamily: 'Georgia', fontSize: 18 },
        headerShadowVisible: false,
        tabBarActiveTintColor: '#1f1a17',
      }}
    >
      <Tabs.Screen
        name="review/index"
        options={{
          title: 'Review',
          tabBarBadge: pending > 0 ? pending : undefined,
        }}
      />
      <Tabs.Screen name="review/[id]" options={{ href: null, title: 'Candidate' }} />
    </Tabs>
  );
}
