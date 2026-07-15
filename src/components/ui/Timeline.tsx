import { View, Text } from 'react-native';
import type { ReservationType } from '@/domain/reservation';
import type { OperationalStatus } from '@/domain/status';
import { ReservationBadge } from './ReservationBadge';
import { StatusChip } from './StatusChip';

export interface TimelineItem {
  id: string;
  time: string;
  title: string;
  /** Remaining prose detail (e.g. carrier + flight number) — not counts/codes. */
  detail?: string;
  type: ReservationType;
  status?: OperationalStatus;
  /** Typeset night count, e.g. "Night 1 of 3". */
  nightLabel?: string;
  confirmationCode?: string;
}

export interface TimelineProps {
  items: TimelineItem[];
}

const DOT_COLOR: Record<ReservationType, string> = {
  flight: 'bg-type-flight',
  lodging: 'bg-type-lodging',
  dining: 'bg-type-dining',
  activity: 'bg-type-activity',
  transit: 'bg-type-transit',
};

export function Timeline({ items }: TimelineProps) {
  return (
    <View className="pl-4">
      {items.map((item, idx) => (
        <View key={item.id} className="flex-row">
          <View className="items-center mr-3" style={{ width: 16 }}>
            <View className={`w-3 h-3 rounded-full mt-2 ${DOT_COLOR[item.type]}`} />
            {idx < items.length - 1 ? (
              <View className="w-px flex-1 bg-paper-dim mt-1 mb-1" />
            ) : null}
          </View>
          <View className="flex-1 pb-4">
            <View className="flex-row items-center gap-2 flex-wrap">
              <Text className="font-mono text-xs uppercase tracking-wider text-ink-muted tabular-nums">
                {item.time}
              </Text>
              <ReservationBadge type={item.type} />
              {item.status ? <StatusChip status={item.status} /> : null}
            </View>
            <Text className="text-base font-medium text-ink mt-0.5">{item.title}</Text>
            {item.detail ? (
              <Text className="text-sm text-ink-soft mt-0.5">{item.detail}</Text>
            ) : null}
            {item.nightLabel || item.confirmationCode ? (
              <View className="flex-row flex-wrap gap-2 mt-1">
                {item.nightLabel ? (
                  <Text className="font-mono text-xs text-ink-muted tabular-nums">
                    {item.nightLabel}
                  </Text>
                ) : null}
                {item.confirmationCode ? (
                  <Text className="font-mono text-xs text-ink-muted tabular-nums">
                    {item.confirmationCode}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}
