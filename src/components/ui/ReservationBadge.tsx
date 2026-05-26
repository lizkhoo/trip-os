import { View, Text } from 'react-native';
import type { ReservationType } from '@/domain/reservation';

const LABELS: Record<ReservationType, string> = {
  flight: 'Flight',
  lodging: 'Lodging',
  dining: 'Dining',
  activity: 'Activity',
  transit: 'Transit',
};

const BG: Record<ReservationType, string> = {
  flight: 'bg-type-flight',
  lodging: 'bg-type-lodging',
  dining: 'bg-type-dining',
  activity: 'bg-type-activity',
  transit: 'bg-type-transit',
};

export interface ReservationBadgeProps {
  type: ReservationType;
  label?: string;
}

export function ReservationBadge({ type, label }: ReservationBadgeProps) {
  return (
    <View className={`self-start rounded-full px-2.5 py-0.5 ${BG[type]}`}>
      <Text className="text-[10px] uppercase tracking-wider text-paper">
        {label ?? LABELS[type]}
      </Text>
    </View>
  );
}
