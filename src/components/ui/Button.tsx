import { Pressable, Text, type PressableProps } from 'react-native';

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
}

const BG = {
  primary: 'bg-ink active:bg-ink-soft',
  secondary: 'bg-paper-warm active:bg-paper-dim',
  ghost: 'bg-transparent active:bg-paper-warm',
};

const FG = {
  primary: 'text-paper',
  secondary: 'text-ink',
  ghost: 'text-ink',
};

const SIZE = {
  sm: 'px-3 py-1.5',
  md: 'px-4 py-2.5',
};

const TEXT_SIZE = {
  sm: 'text-sm',
  md: 'text-base',
};

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: ButtonProps) {
  return (
    <Pressable
      className={`rounded-xl ${BG[variant]} ${SIZE[size]} ${className ?? ''}`}
      accessibilityRole="button"
      {...rest}
    >
      <Text className={`text-center font-medium ${FG[variant]} ${TEXT_SIZE[size]}`}>{title}</Text>
    </Pressable>
  );
}
