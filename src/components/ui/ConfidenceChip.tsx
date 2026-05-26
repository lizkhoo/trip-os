import { View, Text } from 'react-native';

export interface ConfidenceChipProps {
  value: number;
  /** Threshold above which the chip is rendered "high" (default 0.9). */
  highThreshold?: number;
  /** Threshold above which the chip is rendered "medium" (default 0.7). */
  mediumThreshold?: number;
}

export function ConfidenceChip({
  value,
  highThreshold = 0.9,
  mediumThreshold = 0.7,
}: ConfidenceChipProps) {
  const pct = Math.round(value * 100);
  let bg = 'bg-accent-slate';
  if (value >= highThreshold) bg = 'bg-accent-forest';
  else if (value >= mediumThreshold) bg = 'bg-accent-ochre';
  return (
    <View className={`self-start rounded px-2 py-0.5 ${bg}`}>
      <Text className="text-[10px] font-medium text-paper">{pct}%</Text>
    </View>
  );
}
