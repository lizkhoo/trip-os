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
  StatusChip,
  Timeline,
  type TimelineItem,
} from '@/components/ui';
import { OPERATIONAL_STATUSES } from '@/domain/status';
import { color } from '@/theme/tokens';

const SAMPLE: TimelineItem[] = [
  {
    id: '1',
    time: '09:02',
    title: 'AS 338 RDM → SEA',
    type: 'flight',
    status: 'upcoming',
    confirmationCode: 'ABC123',
  },
  {
    id: '2',
    time: '13:30',
    title: 'JL 67 SEA → NRT',
    detail: 'Arrives Mar 15, 15:40',
    type: 'flight',
    status: 'confirmed',
  },
  {
    id: '3',
    time: '20:00',
    title: 'Chef Mickey',
    detail: 'Disney Ambassador Hotel',
    type: 'dining',
    status: 'needs_review',
  },
  {
    id: '4',
    time: 'overnight',
    title: 'Disney Ambassador Hotel',
    type: 'lodging',
    status: 'in_progress',
    nightLabel: 'Night 1 of 3',
  },
];

const NEUTRAL_SWATCHES: { name: string; hex: string; className: string }[] = [
  { name: 'ink', hex: color.ink, className: 'bg-ink' },
  { name: 'ink-soft', hex: color.inkSoft, className: 'bg-ink-soft' },
  { name: 'ink-muted', hex: color.inkMuted, className: 'bg-ink-muted' },
];

const SURFACE_SWATCHES: { name: string; hex: string; className: string }[] = [
  { name: 'paper', hex: color.paper, className: 'bg-paper border border-paper-dim' },
  { name: 'paper-warm', hex: color.paperWarm, className: 'bg-paper-warm' },
  { name: 'paper-dim', hex: color.paperDim, className: 'bg-paper-dim' },
];

const BRAND_SWATCHES: { name: string; hex: string; className: string }[] = [
  { name: 'brand', hex: color.brand, className: 'bg-brand' },
  { name: 'brand-soft', hex: color.brandSoft, className: 'bg-brand-soft' },
  { name: 'brand-deep', hex: color.brandDeep, className: 'bg-brand-deep' },
];

const STATUS_SOLID_SWATCHES: { name: string; hex: string; className: string }[] = [
  { name: 'good', hex: color.status.good, className: 'bg-status-good' },
  { name: 'warn', hex: color.status.warn, className: 'bg-status-warn' },
  { name: 'alert', hex: color.status.alert, className: 'bg-status-alert' },
  { name: 'info', hex: color.status.info, className: 'bg-status-info' },
  { name: 'neutral', hex: color.status.neutral, className: 'bg-status-neutral' },
];

const STATUS_SOFT_SWATCHES: { name: string; hex: string; className: string }[] = [
  { name: 'goodSoft', hex: color.status.goodSoft, className: 'bg-status-goodSoft' },
  { name: 'warnSoft', hex: color.status.warnSoft, className: 'bg-status-warnSoft' },
  { name: 'alertSoft', hex: color.status.alertSoft, className: 'bg-status-alertSoft' },
  { name: 'infoSoft', hex: color.status.infoSoft, className: 'bg-status-infoSoft' },
  { name: 'neutralSoft', hex: color.status.neutralSoft, className: 'bg-status-neutralSoft' },
];

const TYPE_SWATCHES: { name: string; hex: string; className: string }[] = [
  { name: 'flight', hex: color.type.flight, className: 'bg-type-flight' },
  { name: 'lodging', hex: color.type.lodging, className: 'bg-type-lodging' },
  { name: 'dining', hex: color.type.dining, className: 'bg-type-dining' },
  { name: 'activity', hex: color.type.activity, className: 'bg-type-activity' },
  { name: 'transit', hex: color.type.transit, className: 'bg-type-transit' },
];

export default function PrimitivesShowcase() {
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [date, setDate] = useState(new Date('2026-03-14T09:02:00-07:00'));
  return (
    <ScrollView className="flex-1 bg-paper px-4">
      <Text className="font-serif text-3xl text-ink mt-4 mb-1">Primitives</Text>
      <Text className="text-sm text-ink-muted mb-4">
        Visual regression surface — tokens, StatusChip states, and every blessed primitive.
      </Text>

      <Section title="Tokens · Neutrals">
        <SwatchRow swatches={NEUTRAL_SWATCHES} />
      </Section>

      <Section title="Tokens · Surfaces">
        <SwatchRow swatches={SURFACE_SWATCHES} />
      </Section>

      <Section title="Tokens · Brand">
        <SwatchRow swatches={BRAND_SWATCHES} />
      </Section>

      <Section title="Tokens · Status solids">
        <SwatchRow swatches={STATUS_SOLID_SWATCHES} />
      </Section>

      <Section title="Tokens · Status softs">
        <SwatchRow swatches={STATUS_SOFT_SWATCHES} />
      </Section>

      <Section title="Tokens · Types">
        <SwatchRow swatches={TYPE_SWATCHES} />
      </Section>

      <Section title="Typography">
        <Text className="font-sans text-base text-ink mb-1">Sans — body and UI</Text>
        <Text className="font-serif text-2xl text-ink mb-1">Serif — editorial headings</Text>
        <Text className="font-mono text-base text-ink tabular-nums">Mono — 09:02 · ABC123 · Night 1 of 3</Text>
      </Section>

      <Section title="StatusChip">
        <View className="flex-row flex-wrap gap-2">
          {OPERATIONAL_STATUSES.map((s) => (
            <StatusChip key={s} status={s} />
          ))}
        </View>
      </Section>

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

function SwatchRow({
  swatches,
}: {
  swatches: { name: string; hex: string; className: string }[];
}) {
  return (
    <View className="flex-row flex-wrap gap-3">
      {swatches.map((s) => (
        <View key={s.name} className="items-center" style={{ width: 72 }}>
          <View className={`w-12 h-12 rounded-xl ${s.className}`} />
          <Text className="text-[10px] text-ink-muted mt-1 text-center">{s.name}</Text>
          <Text className="font-mono text-[9px] text-ink-muted">{s.hex}</Text>
        </View>
      ))}
    </View>
  );
}
