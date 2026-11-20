import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, ScrollView, Text, View, useWindowDimensions, type HostInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionButton } from "@/components/Ui";
import { useTourAnchorRegistry, useTourAnchorVersion, type TourRect } from "@/TourAnchors";
import { colors, styles } from "@/theme";

type SpotlightStep = {
  screenId: string;
  title: string;
  purpose: string;
  action: string;
  limit: string;
};

type TourTarget = { id: string; action?: string };

const tourTargets: Record<string, TourTarget[]> = {
  today: [{ id: "today.workspace-search" }],
  cases: [
    { id: "cases.tribunal", action: "Selecione o tribunal ou use + Outro tribunal para informar um nome." },
    { id: "cases.new-process", action: "Abra o cadastro pelo botão do topo; ele não salva nada sozinho." },
    { id: "cases.return-to-matters", action: "Volte para assuntos e processos para abrir a lista de processos." },
  ],
  calendar: [{ id: "agenda.new-entry", action: "Escolha Agenda para anotar um compromisso ou Tarefas para organizar um próximo passo." }],
  finance: [{ id: "finance.new-entry" }],
  research: [{ id: "research.question" }],
  files: [{ id: "files.add-document", action: "Abra Adicionar documento e escolha um PDF do aparelho ou de uma conta conectada." }],
};

type Placement = { x: number; y: number; width: number; maxHeight: number };
type MeasuredBox = TourRect & { key: string };

function validRect(rect: TourRect | null): rect is TourRect {
  return Boolean(rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0);
}

function measureInWindow(ref: { current: HostInstance | null }): Promise<TourRect | null> {
  return new Promise((resolve) => {
    const node = ref.current as (View & { measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void }) | null;
    if (!node?.measureInWindow) {
      resolve(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      const rect = { x, y, width, height };
      resolve(validRect(rect) ? rect : null);
    });
  });
}

function sameRect(a: TourRect | null, b: TourRect) {
  return Boolean(a && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function intersect(a: TourRect, b: TourRect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function getPlacement(viewport: Pick<TourRect, "width" | "height">, target: TourRect, card: TourRect, compact: boolean, insets: { top: number; bottom: number }): Placement {
  const horizontalMargin = compact ? 12 : 20;
  const topBound = Math.max(12, insets.top + 8);
  const bottomPadding = compact ? 84 + insets.bottom : 18;
  const leftBound = horizontalMargin;
  const rightBound = Math.max(leftBound + 1, viewport.width - horizontalMargin);
  const bottomBound = Math.max(topBound + 1, viewport.height - bottomPadding);
  const gap = 12;
  const availableHeight = bottomBound - topBound;
  const safeTarget = {
    x: clamp(target.x - 8, leftBound, rightBound - 1),
    y: clamp(target.y - 8, topBound, bottomBound - 1),
    width: Math.max(1, Math.min(target.x + target.width + 8, rightBound) - Math.max(target.x - 8, leftBound)),
    height: Math.max(1, Math.min(target.y + target.height + 8, bottomBound) - Math.max(target.y - 8, topBound)),
  };

  if (!compact) {
    const leftRoom = safeTarget.x - leftBound - gap;
    const rightRoom = rightBound - (safeTarget.x + safeTarget.width) - gap;
    const sideRoom = Math.max(leftRoom, rightRoom);
    if (sideRoom >= 300) {
      const width = Math.min(420, sideRoom);
      const height = Math.min(availableHeight, Math.max(240, card.height || 360));
      const x = leftRoom >= rightRoom ? safeTarget.x - gap - width : safeTarget.x + safeTarget.width + gap;
      return { x, y: clamp(safeTarget.y - 72, topBound, bottomBound - height), width, maxHeight: availableHeight };
    }
  }

  const below = Math.max(0, bottomBound - safeTarget.y - safeTarget.height - gap);
  const above = Math.max(0, safeTarget.y - topBound - gap);
  const useBelow = below >= above;
  const room = useBelow ? below : above;
  const height = Math.max(150, Math.min(380, room));
  const width = rightBound - leftBound;
  const desiredY = useBelow ? safeTarget.y + safeTarget.height + gap : safeTarget.y - gap - height;
  return { x: leftBound, y: clamp(desiredY, topBound, Math.max(topBound, bottomBound - height)), width, maxHeight: height };
}

export function TourSpotlight({
  activeKey,
  step,
  isScreenGuide,
  stepIndex,
  totalSteps,
  saving,
  message,
  persistenceError,
  onClose,
  onSkip,
  onBack,
  onNext,
  onViewFullTour,
  onRetryPersistence,
  onSpotlightReady,
}: {
  activeKey: string;
  step: SpotlightStep;
  isScreenGuide: boolean;
  stepIndex: number;
  totalSteps: number;
  saving: boolean;
  message: string;
  persistenceError: boolean;
  onClose: () => void;
  onSkip: () => void;
  onBack: () => void;
  onNext: () => void;
  onViewFullTour: () => void;
  onRetryPersistence: () => void;
  onSpotlightReady: () => void;
}) {
  const registry = useTourAnchorRegistry();
  const registryVersion = useTourAnchorVersion(registry);
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const rootRef = useRef<HostInstance | null>(null);
  const ensureAttempted = useRef(new Set<string>());
  const readyCallbackRef = useRef(onSpotlightReady);
  const lastReadyTargetKey = useRef<string | null>(null);
  const [rootSize, setRootSize] = useState({ width, height });
  const [geometry, setGeometry] = useState<MeasuredBox | null>(null);
  const [cardBox, setCardBox] = useState<MeasuredBox | null>(null);
  const [missingKey, setMissingKey] = useState<string | null>(null);
  const [cardFocus, setCardFocus] = useState(false);
  const candidates = tourTargets[step.screenId] ?? [];
  const selectedTarget = candidates.find((target) => registry.get(target.id) !== undefined) ?? null;
  const registration = selectedTarget ? registry.get(selectedTarget.id) : undefined;
  const targetKey = `${activeKey}:${selectedTarget?.id ?? "target-pending"}`;
  const targetRect = geometry?.key === targetKey ? { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height } : null;
  const compact = width < 760 || fontScale > 1.25;
  const fallbackCard = useMemo(() => ({ x: 0, y: 0, width: Math.min(width - 24, 400), height: Math.min(height * 0.55, 360) }), [height, width]);
  const placement = targetRect ? getPlacement(rootSize, targetRect, cardBox?.key === targetKey ? cardBox : fallbackCard, compact, insets) : null;
  const cardAligned = Boolean(placement && cardBox?.key === targetKey && Math.abs(cardBox.x - placement.x) < 1 && Math.abs(cardBox.y - placement.y) < 1 && Math.abs(cardBox.width - placement.width) < 1);
  const aperture = targetRect ? {
    x: clamp(targetRect.x - 8, 0, Math.max(0, rootSize.width - 1)),
    y: clamp(targetRect.y - 8, 0, Math.max(0, rootSize.height - 1)),
    width: Math.max(1, Math.min(targetRect.x + targetRect.width + 8, rootSize.width) - Math.max(targetRect.x - 8, 0)),
    height: Math.max(1, Math.min(targetRect.y + targetRect.height + 8, rootSize.height) - Math.max(targetRect.y - 8, 0)),
  } : null;
  const spotlightReady = Boolean(aperture && placement && cardAligned && cardBox && !intersect(aperture, cardBox));
  const displayedAction = selectedTarget?.action ?? step.action;
  const targetMissing = missingKey === targetKey && !spotlightReady;
  const targetPending = !spotlightReady && !targetMissing;

  useEffect(() => { readyCallbackRef.current = onSpotlightReady; }, [onSpotlightReady]);

  useEffect(() => {
    let cancelled = false;
    const missingTimer = setTimeout(() => {
      if (!cancelled) setMissingKey(targetKey);
    }, 900);

    const updateGeometry = async () => {
      if (!selectedTarget || !registration) return;
      if (!ensureAttempted.current.has(targetKey)) {
        ensureAttempted.current.add(targetKey);
        await registration.ensureVisible();
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (cancelled) return;
      const [root, target] = await Promise.all([measureInWindow(rootRef), registration.measure()]);
      if (cancelled) return;
      if (!validRect(root) || !validRect(target)) return;
      const next: MeasuredBox = {
        key: targetKey,
        x: target.x - root.x,
        y: target.y - root.y,
        width: target.width,
        height: target.height,
      };
      setRootSize({ width: root.width, height: root.height });
      setGeometry((previous) => previous?.key === targetKey && sameRect(previous, next) ? previous : next);
      setMissingKey((previous) => previous === targetKey ? null : previous);
    };
    void updateGeometry();

    return () => {
      cancelled = true;
      if (missingTimer) clearTimeout(missingTimer);
    };
  }, [height, insets.bottom, insets.top, registryVersion, registration, selectedTarget, targetKey, width]);

  useEffect(() => {
    if (!spotlightReady || !geometry || geometry.key !== targetKey || lastReadyTargetKey.current === targetKey) return;
    lastReadyTargetKey.current = targetKey;
    const frame = requestAnimationFrame(() => readyCallbackRef.current());
    if (Platform.OS === "ios") {
      const label = selectedTarget?.id.split(".").at(-1)?.split("-").join(" ") ?? step.title;
      AccessibilityInfo.announceForAccessibility(isScreenGuide
        ? `Ajuda desta tela: ${step.title}. Destaque: ${label}. ${step.purpose}`
        : `Etapa ${stepIndex + 1} de ${totalSteps}: ${step.title}. Destaque: ${label}. ${step.purpose}`);
    }
    return () => cancelAnimationFrame(frame);
  }, [geometry, isScreenGuide, selectedTarget?.id, spotlightReady, step.purpose, step.title, stepIndex, targetKey, totalSteps]);

  const retryTarget = useCallback(() => {
    setMissingKey(null);
    registry.notifyLayout();
  }, [registry]);

  const onCardLayout = (event: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => {
    const next = { ...event.nativeEvent.layout, key: targetKey };
    setCardBox((previous) => previous?.key === targetKey && sameRect(previous, next) ? previous : next);
  };

  const maskColor = "rgba(31, 20, 23, 0.66)";

  return <View ref={rootRef} collapsable={false} pointerEvents="box-none" onLayout={(event) => {
    const next = { width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height };
    setRootSize((previous) => previous.width === next.width && previous.height === next.height ? previous : next);
    registry.notifyLayout();
  }}
    style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
    {spotlightReady && aperture ? <>
      <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" testID="guided-tour-mask-top" style={{ position: "absolute", top: 0, left: 0, width: rootSize.width, height: aperture.y, backgroundColor: maskColor }} />
      <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" testID="guided-tour-mask-left" style={{ position: "absolute", top: aperture.y, left: 0, width: aperture.x, height: aperture.height, backgroundColor: maskColor }} />
      <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" testID="guided-tour-mask-right" style={{ position: "absolute", top: aperture.y, left: aperture.x + aperture.width, width: Math.max(0, rootSize.width - aperture.x - aperture.width), height: aperture.height, backgroundColor: maskColor }} />
      <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" testID="guided-tour-mask-bottom" style={{ position: "absolute", top: aperture.y + aperture.height, left: 0, width: rootSize.width, height: Math.max(0, rootSize.height - aperture.y - aperture.height), backgroundColor: maskColor }} />
      <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" testID="guided-tour-spotlight"
        accessibilityLabel={`Destaque: ${selectedTarget?.id ?? step.screenId}`}
        style={{ position: "absolute", left: aperture.x, top: aperture.y, width: aperture.width, height: aperture.height, borderRadius: 12, borderWidth: 3, borderColor: colors.gold, backgroundColor: "transparent", shadowColor: colors.goldDark, shadowOpacity: 0.5, shadowRadius: 9, elevation: 8 }} />
    </> : null}

    <View testID={isScreenGuide ? "guided-screen-card" : "guided-tour-card"} nativeID="guided-tour-instruction"
      onLayout={onCardLayout}
      style={{ position: "absolute", ...(placement ? { left: placement.x, top: placement.y, width: placement.width, maxHeight: placement.maxHeight } : { left: 12, right: 12, bottom: compact ? 84 + insets.bottom : 16, maxWidth: 560, maxHeight: "70%" }), overflow: "hidden", borderRadius: 20, borderWidth: 1, borderColor: colors.goldDark, backgroundColor: colors.paper, padding: 16, gap: 10, shadowColor: "#241b1d", shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Text accessibilityLiveRegion="polite" style={styles.eyebrow}>{isScreenGuide ? "AJUDA DESTA TELA" : `ETAPA ${stepIndex + 1} DE ${totalSteps}`}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={isScreenGuide ? "Fechar guia desta tela" : "Fechar e continuar depois"} accessibilityHint={isScreenGuide ? "Fecha esta orientação. Ela não aparecerá automaticamente de novo." : "Guarda esta etapa e fecha a explicação por enquanto."}
          onPress={onClose} onFocus={() => setCardFocus(true)} onBlur={() => setCardFocus(false)}
          style={({ pressed }) => [{ minHeight: 48, minWidth: 48, justifyContent: "center", paddingHorizontal: 8, borderRadius: 10 }, cardFocus && styles.focused, pressed && styles.pressed]}>
          <Text style={{ color: colors.wine, fontSize: 14, fontWeight: "700", textAlign: "right" }}>Fechar</Text>
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.heading}>{step.title}</Text>
        <Text style={styles.text}>{step.purpose}</Text>
        <Text style={styles.strong}>Como usar</Text>
        <Text style={styles.small}>{displayedAction}</Text>
        <Text style={styles.strong}>Para conferir</Text>
        <Text style={styles.small}>{step.limit}</Text>
        {targetPending ? <Text accessibilityLiveRegion="polite" style={styles.small}>Localizando o item desta tela…</Text> : null}
        {targetMissing ? <Text accessibilityLiveRegion="assertive" style={[styles.small, { color: colors.error }]}>Não localizei o item para destacar. A tela continua disponível; tente localizar novamente ou feche esta orientação.</Text> : null}
        {message ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{message}</Text> : null}
      </ScrollView>

      <Text style={styles.small}>{isScreenGuide ? "Esta orientação aparece automaticamente só na primeira visita." : "Você pode navegar pelo app; fechar guarda seu progresso."}</Text>
      {persistenceError ? <ActionButton label="Tentar salvar orientação" secondary disabled={saving} onPress={onRetryPersistence} /> : null}
      {targetMissing ? <ActionButton label="Tentar localizar novamente" secondary onPress={retryTarget} /> : null}

      {isScreenGuide ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <View style={{ flex: 1, minWidth: 140 }}><ActionButton label="Fechar guia" secondary onPress={onClose} /></View>
        <View style={{ flex: 1, minWidth: 140 }}><ActionButton label="Ver tour completo" disabled={saving} onPress={onViewFullTour} /></View>
      </View> : targetMissing ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <View style={{ flex: 1, minWidth: 140 }}><ActionButton label="Fechar e continuar depois" secondary onPress={onClose} /></View>
        <View style={{ flex: 1, minWidth: 120 }}><ActionButton label="Pular tour" disabled={saving} onPress={onSkip} /></View>
      </View> : <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <View style={{ flex: 1, minWidth: 100 }}><ActionButton label="Pular tour" secondary disabled={saving} onPress={onSkip} /></View>
        {stepIndex > 0 ? <View style={{ flex: 1, minWidth: 100 }}><ActionButton label="Voltar" secondary disabled={saving} onPress={onBack} /></View> : null}
        <View style={{ flex: 1, minWidth: 100 }}><ActionButton label={saving ? "Salvando…" : stepIndex + 1 === totalSteps ? "Concluir tour" : "Próxima tela"} disabled={saving} onPress={onNext} /></View>
      </View>}
    </View>
  </View>;
}
