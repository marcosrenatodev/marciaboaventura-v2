import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PropsWithChildren, type ReactNode } from "react";
import { View, type HostInstance, type StyleProp, type ViewStyle } from "react-native";

export type TourRect = { x: number; y: number; width: number; height: number };
export type TourMeasure = () => Promise<TourRect | null>;

export type TourAnchorRegistration = {
  measure: TourMeasure;
  ensureVisible: () => Promise<void>;
};

export type TourAnchorRegistry = {
  get: (id: string) => TourAnchorRegistration | undefined;
  register: (id: string, anchor: TourAnchorRegistration) => () => void;
  notifyLayout: () => void;
  subscribe: (listener: () => void) => () => void;
  getVersion: () => number;
};

type TourScrollContextValue = {
  ensureVisible: (measure: TourMeasure, keyboardScreenY?: number) => Promise<void>;
};

const TourAnchorRegistryContext = createContext<TourAnchorRegistry | null>(null);
export const TourScrollContext = createContext<TourScrollContextValue | null>(null);

function createRegistry(): TourAnchorRegistry {
  const anchors = new Map<string, TourAnchorRegistration>();
  const listeners = new Set<() => void>();
  let version = 0;
  const notifyLayout = () => {
    version += 1;
    listeners.forEach((listener) => listener());
  };

  return {
    get: (id) => anchors.get(id),
    register: (id, anchor) => {
      anchors.set(id, anchor);
      notifyLayout();
      return () => {
        if (anchors.get(id) !== anchor) return;
        anchors.delete(id);
        notifyLayout();
      };
    },
    notifyLayout,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVersion: () => version,
  };
}

export function TourAnchorProvider({ children }: PropsWithChildren) {
  const [registry] = useState(() => createRegistry());
  return <TourAnchorRegistryContext.Provider value={registry}>{children}</TourAnchorRegistryContext.Provider>;
}

export function useTourAnchorRegistry() {
  const registry = useContext(TourAnchorRegistryContext);
  if (!registry) throw new Error("TourAnchorProvider precisa envolver as telas autenticadas.");
  return registry;
}

export function useTourAnchorVersion(registry: TourAnchorRegistry) {
  return useSyncExternalStore(registry.subscribe, registry.getVersion, registry.getVersion);
}

export function TourAnchor({ id, children, style, testID }: PropsWithChildren<{ id: string; style?: StyleProp<ViewStyle>; testID?: string }>) {
  const registry = useTourAnchorRegistry();
  const scroller = useContext(TourScrollContext);
  const viewRef = useRef<HostInstance | null>(null);
  const measure = useCallback<TourMeasure>(() => new Promise((resolve) => {
    const node = viewRef.current;
    if (!node?.measureInWindow) {
      resolve(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      if (![x, y, width, height].every(Number.isFinite)) resolve(null);
      else resolve({ x, y, width, height });
    });
  }), []);
  const ensureVisible = useCallback(() => scroller?.ensureVisible(measure) ?? Promise.resolve(), [measure, scroller]);
  const registration = useMemo<TourAnchorRegistration>(() => ({ measure, ensureVisible }), [ensureVisible, measure]);

  useEffect(() => registry.register(id, registration), [id, registry, registration]);

  return <View
    ref={viewRef}
    collapsable={false}
    accessible={false}
    pointerEvents="box-none"
    testID={testID ?? `tour-anchor-${id}`}
    onLayout={registry.notifyLayout}
    style={style}
  >{children as ReactNode}</View>;
}
