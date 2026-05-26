import { View, Text } from 'react-native';

export interface DayHeaderProps {
  date: string;
  weekday?: string;
  label?: string;
  rightAccessory?: React.ReactNode;
}

export function DayHeader({ date, weekday, label, rightAccessory }: DayHeaderProps) {
  return (
    <View className="flex-row items-baseline justify-between px-1 py-3">
      <View>
        <Text className="font-serif text-3xl text-ink">{date}</Text>
        {weekday ? (
          <Text className="text-xs uppercase tracking-widest text-ink-muted">{weekday}</Text>
        ) : null}
        {label ? <Text className="text-sm text-ink-soft mt-1">{label}</Text> : null}
      </View>
      {rightAccessory}
    </View>
  );
}
