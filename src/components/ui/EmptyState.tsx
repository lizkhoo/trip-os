import { View, Text } from 'react-native';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <View className="items-center justify-center p-8">
      <Text className="font-serif text-2xl text-ink text-center">{title}</Text>
      {description ? (
        <Text className="text-sm text-ink-muted text-center mt-2 max-w-xs">{description}</Text>
      ) : null}
      {action ? <View className="mt-4">{action}</View> : null}
    </View>
  );
}
