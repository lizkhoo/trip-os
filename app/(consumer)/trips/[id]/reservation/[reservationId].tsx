import { useEffect, useState } from 'react';
import { ScrollView, View, Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ReservationForm } from '@/components/reservation/ReservationForm';
import { getReservation, updateReservation } from '@/services/reservations';
import type { Reservation, ReservationInput } from '@/domain/reservation';

export default function EditReservation() {
  const params = useLocalSearchParams<{ id: string; reservationId: string }>();
  const router = useRouter();
  const [reservation, setReservation] = useState<Reservation | null>(null);

  useEffect(() => {
    if (!params.reservationId) return;
    void (async () => {
      const r = await getReservation(params.reservationId);
      if (r) setReservation(r);
    })();
  }, [params.reservationId]);

  if (!params.id || !reservation) return <SafeAreaView className="flex-1 bg-paper" />;

  const submit = async (input: ReservationInput): Promise<void> => {
    await updateReservation(reservation.id, input, { manual: true });
    router.back();
  };

  const initial: Partial<ReservationInput> = {
    trip_id: reservation.trip_id,
    type: reservation.type,
    title: reservation.title,
    start_at: reservation.start_at,
    end_at: reservation.end_at,
    start_location_id: reservation.start_location_id,
    end_location_id: reservation.end_location_id,
    confirmation_code: reservation.confirmation_code,
    source: reservation.source,
    source_ref: reservation.source_ref,
    confidence: reservation.confidence,
    status: reservation.status,
    details: reservation.details,
  } as Partial<ReservationInput>;

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <Stack.Screen options={{ title: 'Edit reservation' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 64 }}>
        <View className="mb-3">
          <Text className="font-serif text-3xl text-ink">Edit reservation</Text>
        </View>
        <ReservationForm
          tripId={reservation.trip_id}
          initial={initial}
          typeLocked
          submitLabel="Save"
          onSubmit={submit}
          onCancel={() => router.back()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
