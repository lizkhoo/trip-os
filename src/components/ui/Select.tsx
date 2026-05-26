import { useState } from 'react';
import { View, Text, Pressable, Modal, FlatList } from 'react-native';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string = string> {
  label?: string;
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
}

export function Select<T extends string = string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select…',
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View>
      {label ? (
        <Text className="text-xs uppercase tracking-wider text-ink-muted mb-1">{label}</Text>
      ) : null}
      <Pressable
        className="border border-paper-dim bg-paper rounded-xl px-3 py-2.5"
        onPress={() => setOpen(true)}
        accessibilityRole="combobox"
      >
        <Text className={`text-base ${current ? 'text-ink' : 'text-ink-muted'}`}>
          {current?.label ?? placeholder}
        </Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          className="flex-1 justify-end bg-ink/40"
          onPress={() => setOpen(false)}
          accessibilityRole="button"
        >
          <View className="bg-paper rounded-t-3xl pb-8">
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              renderItem={({ item }) => (
                <Pressable
                  className="px-5 py-4 border-b border-paper-dim"
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <Text className="text-base text-ink">{item.label}</Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
