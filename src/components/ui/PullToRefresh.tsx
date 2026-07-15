import { ScrollView, RefreshControl, type ScrollViewProps } from 'react-native';
import { useCallback, useState } from 'react';
import { color } from '@/theme/tokens';

export interface PullToRefreshProps extends ScrollViewProps {
  onRefresh: () => Promise<void> | void;
}

export function PullToRefresh({ onRefresh, children, ...rest }: PullToRefreshProps) {
  const [refreshing, setRefreshing] = useState(false);
  const handle = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);
  return (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handle} tintColor={color.inkMuted} />
      }
      {...rest}
    >
      {children}
    </ScrollView>
  );
}
