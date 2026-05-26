import { forwardRef, useImperativeHandle, useRef, useMemo } from 'react';
import GorhomBottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { View } from 'react-native';

export interface BottomSheetHandle {
  expand(): void;
  close(): void;
}

export interface BottomSheetProps {
  children: React.ReactNode;
  snapPoints?: (number | string)[];
}

export const BottomSheet = forwardRef<BottomSheetHandle, BottomSheetProps>(function BottomSheet(
  { children, snapPoints = ['40%', '85%'] },
  ref,
) {
  const inner = useRef<GorhomBottomSheet>(null);
  const snaps = useMemo(() => snapPoints, [snapPoints]);

  useImperativeHandle(ref, () => ({
    expand: () => inner.current?.expand(),
    close: () => inner.current?.close(),
  }));

  return (
    <GorhomBottomSheet
      ref={inner}
      index={-1}
      snapPoints={snaps}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: '#fbf7f0' }}
      handleIndicatorStyle={{ backgroundColor: '#6b6058' }}
    >
      <BottomSheetView>
        <View className="px-5 pb-8">{children}</View>
      </BottomSheetView>
    </GorhomBottomSheet>
  );
});
