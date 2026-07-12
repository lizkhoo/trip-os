import { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { searchTripDestinations, type TripDestination } from '@/lib/tripDestinations';
import { Input, type InputProps } from './Input';

export interface LocationAutocompleteProps extends Omit<InputProps, 'onChangeText'> {
  value: string;
  onChangeText: (text: string) => void;
  onSelectLocation?: (destination: TripDestination) => void;
}

export function LocationAutocomplete({
  value,
  onChangeText,
  onSelectLocation,
  ...rest
}: LocationAutocompleteProps) {
  const [focused, setFocused] = useState(false);
  const suggestions = useMemo(
    () => (focused ? searchTripDestinations(value) : []),
    [focused, value],
  );

  const pick = (destination: TripDestination) => {
    onChangeText(destination.name);
    onSelectLocation?.(destination);
    setFocused(false);
  };

  return (
    <View>
      <Input
        {...rest}
        value={value}
        onChangeText={onChangeText}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          // Defer so a suggestion tap registers before the list hides.
          setTimeout(() => setFocused(false), 150);
          rest.onBlur?.(e);
        }}
        autoCorrect={false}
      />
      {suggestions.length > 0 ? (
        <View className="mt-1 border border-paper-dim rounded-xl bg-paper overflow-hidden">
          {suggestions.map((item) => (
            <Pressable
              key={item.name}
              className="px-3 py-3 border-b border-paper-dim last:border-b-0 active:bg-paper-warm"
              onPress={() => pick(item)}
            >
              <Text className="text-base text-ink">{item.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
