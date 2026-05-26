import { View, Text } from 'react-native';
import type { ReservationType } from '@/domain/reservation';
import { ReservationBadge } from './ReservationBadge';

export interface TimelineItem {
  id: string;
  time: string;
  title: string;
  detail?: string;
  type: ReservationType;
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
            <View className="flex-row items-center gap-2">
              <Text className="text-xs uppercase tracking-wider text-ink-muted">{item.time}</Text>
              <ReservationBadge type={item.type} />
            </View>
            <Text className="text-base font-medium text-ink mt-0.5">{item.title}</Text>
            {item.detail ? (
              <Text className="text-sm text-ink-soft mt-0.5">{item.detail}</Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}
