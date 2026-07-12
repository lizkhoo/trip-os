// Must be first: installs full Intl locale + IANA timezone data for Hermes
// before any timezone-aware code (src/lib/time.ts) runs. See the module header.
import '@/lib/intl-polyfill';
import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { View, Text, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { getDb } from '@/db/client';
import migrations from '@/db/migrations/migrations';

export default function RootLayout() {
  // In the app, getDb() returns the expo-sqlite-backed client that useMigrations
  // expects; the cast re-narrows our backend-agnostic Db port type to it.
  const { success, error } = useMigrations(getDb() as unknown as ExpoSQLiteDatabase, migrations);

  useEffect(() => {
    if (error) console.error('Migration failed:', error);
  }, [error]);

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-paper p-6">
        <Text className="font-serif text-2xl text-accent-rust mb-2">Migration failed</Text>
        <Text className="text-sm text-ink-soft text-center">{error.message}</Text>
      </View>
    );
  }
  if (!success) {
    return (
      <View className="flex-1 items-center justify-center bg-paper">
        <ActivityIndicator color="#1f1a17" />
        <Text className="text-sm text-ink-muted mt-2">Applying migrations…</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#fbf7f0' },
            headerTitleStyle: { fontFamily: 'Georgia' },
          }}
        >
          <Stack.Screen name="(consumer)" options={{ headerShown: false }} />
          <Stack.Screen name="(admin)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="dev" options={{ headerShown: false }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
