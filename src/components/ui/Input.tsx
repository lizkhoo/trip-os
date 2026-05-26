import { View, Text, TextInput, type TextInputProps } from 'react-native';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, ...rest }: InputProps) {
  return (
    <View>
      {label ? (
        <Text className="text-xs uppercase tracking-wider text-ink-muted mb-1">{label}</Text>
      ) : null}
      <TextInput
        className={`border border-paper-dim bg-paper rounded-xl px-3 py-2.5 text-base text-ink ${className ?? ''}`}
        placeholderTextColor="#a39787"
        {...rest}
      />
      {error ? <Text className="text-xs text-accent-rust mt-1">{error}</Text> : null}
    </View>
  );
}
