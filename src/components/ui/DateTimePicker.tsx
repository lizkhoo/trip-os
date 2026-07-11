import { useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import RNDateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';

export interface DateTimePickerProps {
  label?: string;
  value: Date;
  onChange: (date: Date) => void;
  mode?: 'date' | 'time' | 'datetime';
}

function formatValue(value: Date, mode: 'date' | 'time' | 'datetime'): string {
  switch (mode) {
    case 'date':
      return value.toLocaleDateString();
    case 'time':
      return value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    case 'datetime':
      return value.toLocaleString();
    default: {
      const exhaustive: never = mode;
      throw new Error(`Unhandled mode: ${exhaustive}`);
    }
  }
}

export function DateTimePicker({
  label,
  value,
  onChange,
  mode = 'datetime',
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);

  const handleChange = (_: DateTimePickerEvent, d?: Date) => {
    // Date-only selection is a single tap — dismiss immediately on both
    // platforms. datetime/time on iOS stay open for multi-part adjustment.
    if (Platform.OS === 'android' || mode === 'date') setOpen(false);
    if (d) onChange(d);
  };

  return (
    <View>
      {label ? (
        <Text className="text-xs uppercase tracking-wider text-ink-muted mb-1">{label}</Text>
      ) : null}
      <Pressable
        className="border border-paper-dim bg-paper rounded-xl px-3 py-2.5"
        onPress={() => setOpen(true)}
      >
        <Text className="text-base text-ink">{formatValue(value, mode)}</Text>
      </Pressable>
      {open ? (
        <RNDateTimePicker
          value={value}
          mode={mode}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={handleChange}
        />
      ) : null}
    </View>
  );
}
