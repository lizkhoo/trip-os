import { useState } from 'react';
import { ScrollView, View, Text } from 'react-native';
import {
  Button,
  Card,
  ConfidenceChip,
  DateTimePicker,
  DayHeader,
  EmptyState,
  Input,
  ReservationBadge,
  Select,
  Timeline,
  type TimelineItem,
} from '@/components/ui';

const SAMPLE: TimelineItem[] = [
  { id: '1', time: '9:02 AM', title: 'AS 338 RDM → SEA', type: 'flight' },
  { id: '2', time: '1:30 PM', title: 'JL 67 SEA → NRT', detail: 'Arrives Mar 15, 3:40 PM', type: 'flight' },
  { id: '3', time: '8:00 PM', title: 'Chef Mickey', detail: 'Disney Ambassador Hotel', type: 'dining' },
  { id: '4', time: 'overnight', title: 'Disney Ambassador Hotel', detail: 'Night 1 of 3', type: 'lodging' },
];

export default function PrimitivesShowcase() {
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [date, setDate] = useState(new Date('2026-03-14T09:02:00-07:00'));
  return (
    <ScrollView className="flex-1 bg-paper px-4">
      <Text className="font-serif text-3xl text-ink mt-4 mb-1">Primitives</Text>
      <Text className="text-sm text-ink-muted mb-4">
        Visual regression surface — every blessed primitive renders here.
      </Text>

      <Section title="Card">
        <Card>
          <Text className="text-ink">A raised card with body text.</Text>
        </Card>
        <View className="h-3" />
        <Card variant="plain">
          <Text className="text-ink">Plain variant — no shadow.</Text>
        </Card>
      </Section>

      <Section title="DayHeader">
        <DayHeader date="Mar 14" weekday="Saturday" label="Depart Bend" />
      </Section>

      <Section title="ReservationBadge">
        <View className="flex-row flex-wrap gap-2">
          <ReservationBadge type="flight" />
          <ReservationBadge type="lodging" />
          <ReservationBadge type="dining" />
          <ReservationBadge type="activity" />
          <ReservationBadge type="transit" />
        </View>
      </Section>

      <Section title="ConfidenceChip">
        <View className="flex-row gap-2">
          <ConfidenceChip value={0.42} />
          <ConfidenceChip value={0.78} />
          <ConfidenceChip value={0.95} />
        </View>
      </Section>

      <Section title="Timeline">
        <Timeline items={SAMPLE} />
      </Section>

      <Section title="EmptyState">
        <EmptyState
          title="Nothing here yet"
          description="Connect Gmail or upload a screenshot to add reservations."
          action={<Button title="Connect Gmail" />}
        />
      </Section>

      <Section title="Button">
        <View className="gap-2">
          <Button title="Primary" />
          <Button title="Secondary" variant="secondary" />
          <Button title="Ghost" variant="ghost" />
          <Button title="Small" size="sm" />
        </View>
      </Section>

      <Section title="Input">
        <Input
          label="Confirmation code"
          placeholder="e.g. ABCDEF"
          value={text}
          onChangeText={setText}
        />
      </Section>

      <Section title="Select">
        <Select
          label="Reservation type"
          value={selected}
          onChange={setSelected}
          options={[
            { value: 'flight', label: 'Flight' },
            { value: 'lodging', label: 'Lodging' },
            { value: 'dining', label: 'Dining' },
            { value: 'activity', label: 'Activity' },
            { value: 'transit', label: 'Transit' },
          ]}
        />
      </Section>

      <Section title="DateTimePicker">
        <DateTimePicker label="Departure" value={date} onChange={setDate} />
      </Section>

      <View className="h-12" />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-6">
      <Text className="text-xs uppercase tracking-widest text-ink-muted mb-2">{title}</Text>
      {children}
    </View>
  );
}
