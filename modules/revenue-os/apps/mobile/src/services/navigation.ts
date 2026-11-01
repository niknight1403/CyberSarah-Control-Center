import { createRef } from 'react';
import { NavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';

export const navigationRef = createRef<NavigationContainerRef<RootStackParamList>>();

export function navigate(name: keyof RootStackParamList, params?: Record<string, unknown>): void {
  if (navigationRef.current) {
    navigationRef.current.navigate(name as never, params as never);
  }
}

export function goBack(): void {
  if (navigationRef.current && navigationRef.current.canGoBack()) {
    navigationRef.current.goBack();
  }
}

export function resetTo(screen: keyof RootStackParamList): void {
  if (navigationRef.current) {
    navigationRef.current.reset({
      index: 0,
      routes: [{ name: screen as never }],
    });
  }
}
