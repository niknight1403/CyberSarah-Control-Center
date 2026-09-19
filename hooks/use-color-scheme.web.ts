import { useColorScheme as useRNColorScheme } from "react-native";
import { useSyncExternalStore } from "react";

// Sprint 171: Hydration-Flag ohne synchrones setState im Effect — das
// useSyncExternalStore-Server-/Client-Snapshot-Muster macht dasselbe:
// Server-Render liefert "light", nach der Hydration den echten Farbschema-Wert.
const subscribeNoop = () => () => {};

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return "light";
}
