import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ReservationForm } from '@/components/reservation/ReservationForm';
import { createReservation } from '@/services/reservations';
import type { ReservationInput } from '@/domain/reservation';

export default function NewReservation() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  if (!params.id) return <SafeAreaView className="flex-1 bg-paper" />;

  const submit = async (input: ReservationInput): Promise<void> => {
    await createReservation({ ...input, source: 'manual' });
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <Stack.Screen options={{ title: 'Add reservation' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 64 }}>
        <View className="mb-3">
          <Text className="font-serif text-3xl text-ink">Add reservation</Text>
        </View>
        <ReservationForm
          tripId={params.id}
          submitLabel="Add"
          onSubmit={submit}
          onCancel={() => router.back()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
