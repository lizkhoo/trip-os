import { StatusChip } from './StatusChip';
import type { StatusTone } from '@/domain/status';

export interface ConfidenceChipProps {
  value: number;
  /** Threshold above which the chip is rendered "high" (default 0.9). */
  highThreshold?: number;
  /** Threshold above which the chip is rendered "medium" (default 0.7). */
  mediumThreshold?: number;
}

/** Thin wrapper: confidence → status tone + percent label via StatusChip. */
export function ConfidenceChip({
  value,
  highThreshold = 0.9,
  mediumThreshold = 0.7,
}: ConfidenceChipProps) {
  const pct = Math.round(value * 100);
  let tone: StatusTone = 'neutral';
  if (value >= highThreshold) tone = 'good';
  else if (value >= mediumThreshold) tone = 'warn';
  return <StatusChip tone={tone} label={`${pct}%`} />;
}
