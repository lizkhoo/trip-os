import { View, Text } from 'react-native';
import {
  STATUS_LABEL,
  STATUS_TONE,
  type OperationalStatus,
  type StatusTone,
} from '@/domain/status';

const TONE_CLASSES: Record<StatusTone, { bg: string; text: string }> = {
  good: { bg: 'bg-status-goodSoft', text: 'text-status-good' },
  warn: { bg: 'bg-status-warnSoft', text: 'text-status-warn' },
  alert: { bg: 'bg-status-alertSoft', text: 'text-status-alert' },
  info: { bg: 'bg-status-infoSoft', text: 'text-status-info' },
  neutral: { bg: 'bg-status-neutralSoft', text: 'text-status-neutral' },
};

export interface StatusChipProps {
  /** Operational status — drives tone + default one-word label. */
  status?: OperationalStatus;
  /** Override tone when not using an operational status (e.g. ConfidenceChip). */
  tone?: StatusTone;
  /** Override the one-word label (e.g. "42%" for confidence). */
  label?: string;
}

/**
 * Soft background + solid text + one uppercase word.
 * The design system's glanceable status primitive.
 */
export function StatusChip({ status, tone, label }: StatusChipProps) {
  const resolvedTone: StatusTone = tone ?? (status ? STATUS_TONE[status] : 'neutral');
  const resolvedLabel = label ?? (status ? STATUS_LABEL[status] : 'Unknown');
  const classes = TONE_CLASSES[resolvedTone];

  return (
    <View className={`self-start rounded-full px-2.5 py-0.5 ${classes.bg}`}>
      <Text className={`text-[10px] font-medium uppercase tracking-wider ${classes.text}`}>
        {resolvedLabel}
      </Text>
    </View>
  );
}
