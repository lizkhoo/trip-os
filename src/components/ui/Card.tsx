import { View, type ViewProps } from 'react-native';

export interface CardProps extends ViewProps {
  variant?: 'plain' | 'raised';
}

export function Card({ variant = 'raised', className, children, ...rest }: CardProps) {
  const base = 'rounded-2xl bg-paper p-4';
  const shadow = variant === 'raised' ? 'shadow-md shadow-ink/10 border border-paper-dim' : '';
  return (
    <View className={`${base} ${shadow} ${className ?? ''}`} {...rest}>
      {children}
    </View>
  );
}
