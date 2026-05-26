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

export function DateTimePicker({
  label,
  value,
  onChange,
  mode = 'datetime',
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);

  const handleChange = (_: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === 'android') setOpen(false);
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
        <Text className="text-base text-ink">{value.toLocaleString()}</Text>
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
