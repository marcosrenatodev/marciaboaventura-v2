import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren, type ReactNode, type Ref } from "react";
import { useRouter, type Href } from "expo-router";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ScrollViewInstance, type StyleProp, type ViewInstance, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useDemo } from "@/demo";
import { useAuth } from "@/auth";
import { useWorkData } from "@/work-api";
import { colors, styles } from "@/theme";
import { BrandLogo } from "@/components/BrandLogo";
import { TourScrollContext, useTourAnchorRegistry, type TourMeasure, type TourRect } from "@/TourAnchors";
import { TourHelpActionContext, type GuidedTourScreenId } from "@/TourHelpAction";

export function Screen({ title, subtitle, headerAction, scrollToTop, tourScreenId, children }: PropsWithChildren<{ title: string; subtitle: string; headerAction?: ReactNode; scrollToTop?: number; tourScreenId?: GuidedTourScreenId }>) {
  const router = useRouter();
  const { session, demoMode, signOut, exitDemo } = useAuth();
  const { sessionInfo, issue } = useWorkData();
  const tourHelpContext = useContext(TourHelpActionContext);
  const tourHelpAction = tourHelpContext?.activeScreenId === tourScreenId ? tourHelpContext?.action ?? null : null;
  const { width, fontScale } = useWindowDimensions();
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollOffset = useRef(0);
  const contentHeight = useRef(0);
  const viewportHeight = useRef(0);
  const tourAnchors = useTourAnchorRegistry();
  const demo = demoMode;
  const compactHeader = width < 640 || fontScale > 1.2;
  useEffect(() => {
    if (Platform.OS === "web") return;
    const shown = Keyboard.addListener("keyboardDidShow", (event) => setKeyboardHeight(event.endCoordinates.height));
    const hidden = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => { shown.remove(); hidden.remove(); };
  }, []);
  useEffect(() => {
    if (scrollToTop === undefined || scrollToTop === 0) return;
    const frame = requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [scrollToTop]);

  const ensureTourTargetVisible = useCallback(async (measureTarget: TourMeasure, keyboardScreenY?: number) => {
    const scrollView = scrollRef.current as (ScrollViewInstance & { measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void }) | null;
    const target = await measureTarget();
    if (!target || !scrollView?.measureInWindow || viewportHeight.current <= 0) return;
    const viewport = await new Promise<TourRect | null>((resolve) => {
      if (!scrollView.measureInWindow) {
        resolve(null);
        return;
      }
      scrollView.measureInWindow((x, y, measuredWidth, measuredHeight) => {
        resolve([x, y, measuredWidth, measuredHeight].every(Number.isFinite) ? { x, y, width: measuredWidth, height: measuredHeight } : null);
      });
    });
    if (!viewport) return;

    const targetTop = target.y - viewport.y;
    const targetBottom = targetTop + target.height;
    const inset = 20;
    const visibleBottom = keyboardScreenY === undefined
      ? viewport.y + viewportHeight.current
      : Math.min(viewport.y + viewport.height, keyboardScreenY);
    const safeBottom = visibleBottom - viewport.y - inset;
    if (targetTop >= inset && targetBottom <= safeBottom) return;
    const desiredTop = target.height > viewportHeight.current - inset * 2
      ? inset
      : targetTop < inset ? inset : safeBottom - target.height;
    const delta = targetTop - desiredTop;
    if (Math.abs(delta) < 1) return;

    const maximumOffset = Math.max(0, contentHeight.current - viewportHeight.current);
    const nextOffset = Math.max(0, Math.min(maximumOffset, scrollOffset.current + delta));
    if (Math.abs(nextOffset - scrollOffset.current) < 1) return;
    scrollView.scrollTo({ y: nextOffset, animated: false });
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }, []);
  const tourScrollContext = useMemo(() => ({ ensureVisible: ensureTourTargetVisible }), [ensureTourTargetVisible]);

  return (
    <TourScrollContext.Provider value={tourScrollContext}>
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.demo}>
        <View testID="workspace-session-bar" style={{ width: "100%", maxWidth: 1080, minHeight: 48, alignSelf: "center", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.demoTitle}>{demo ? "Demonstração · dados inteiramente fictícios" : sessionInfo ? "Escritório conectado" : "Aguardando conexão segura com o escritório"}</Text>
            <Text accessibilityLiveRegion="polite" style={styles.demoText}>{demo ? "Sem fonte judicial ou backend. Nada é enviado ou salvo." : issue ?? (sessionInfo ? `Sessão confirmada · acesso ${sessionInfo.tenant.role}.` : "Os dados só aparecem depois de confirmar a sessão na API.")}</Text>
          </View>
          {session ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ActionButton compact label="Conta" accessibilityLabel="Configurações de segurança da conta" secondary onPress={() => router.push("/seguranca" as Href)} />
            <ActionButton compact label="Sair" accessibilityLabel="Sair da conta" secondary onPress={() => {
              void signOut();
              router.replace("/");
            }} />
          </View> : demoMode ? <ActionButton compact label="Encerrar" accessibilityLabel="Encerrar demonstração" secondary onPress={exitDemo} /> : null}
        </View>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined}>
        <ScrollView ref={scrollRef} contentContainerStyle={[styles.content, keyboardHeight > 0 && { paddingBottom: 40 + keyboardHeight }]} keyboardShouldPersistTaps="handled" scrollEventThrottle={32}
          onLayout={(event) => { viewportHeight.current = event.nativeEvent.layout.height; tourAnchors.notifyLayout(); }}
          onContentSizeChange={(_contentWidth, height) => { contentHeight.current = height; tourAnchors.notifyLayout(); }}
          onScroll={(event) => { scrollOffset.current = event.nativeEvent.contentOffset.y; tourAnchors.notifyLayout(); }}>
          <View style={styles.tight}>
            <View style={brandStyles.lockup}>
              <BrandLogo />
              <View style={brandStyles.brandCopy}>
                <Text style={brandStyles.brand}>MÁRCIA BOAVENTURA</Text>
                <Text style={brandStyles.caption}>ADVOCACIA</Text>
              </View>
            </View>
            {headerAction || tourHelpAction ? <View style={[brandStyles.titleRow, compactHeader && brandStyles.titleColumn]}>
              <View style={brandStyles.titleCopy}>
                <Text accessibilityRole="header" style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>
              </View>
              <View style={[brandStyles.titleActions, !headerAction && brandStyles.titleActionsSingle, compactHeader && brandStyles.titleActionsCompact]}>
                {tourHelpAction}
                {headerAction ? <View style={[brandStyles.titleAction, compactHeader && brandStyles.titleActionCompact]}>{headerAction}</View> : null}
              </View>
            </View> : <>
              <Text accessibilityRole="header" style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </>}
          </View>
          {children}
          <Text style={styles.small}>{demo ? "As mudanças ficam somente nesta sessão. Ao recarregar ou fechar o app, os exemplos recomeçam." : "Dados exibidos pela API do escritório. Se a conexão ou sessão falhar, os registros não serão apresentados como salvos."}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </TourScrollContext.Provider>
  );
}

const brandStyles = StyleSheet.create({
  lockup: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12 },
  brandCopy: { borderLeftWidth: 2, borderLeftColor: colors.gold, paddingLeft: 12, gap: 3 },
  brand: { color: colors.wine, fontSize: 13, fontWeight: "800", letterSpacing: 1.1 },
  caption: { color: colors.focus, fontSize: 11, fontWeight: "700", letterSpacing: 1.6 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 20 },
  titleColumn: { flexDirection: "column", alignItems: "stretch", gap: 12 },
  titleCopy: { flex: 1, minWidth: 0, gap: 4 },
  titleActions: { width: 328, flexShrink: 0, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 8 },
  titleActionsSingle: { width: 96 },
  titleActionsCompact: { width: "100%", flexDirection: "column", alignItems: "stretch" },
  titleAction: { width: 220, flexShrink: 0 },
  titleActionCompact: { width: "100%" },
});

export function Card({ children, style, testID }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; testID?: string }>) {
  return <View testID={testID} style={[styles.card, style]}>{children}</View>;
}

export function Heading({ children }: PropsWithChildren) {
  return <Text accessibilityRole="header" style={styles.heading}>{children}</Text>;
}

export function ActionButton({ label, accessibilityLabel, onPress, secondary, accessibilityHint, disabled, compact, testID, ref, expanded }: {
  label: string; accessibilityLabel?: string; onPress: () => void; secondary?: boolean; accessibilityHint?: string; disabled?: boolean; compact?: boolean; testID?: string;
  ref?: Ref<ViewInstance>; expanded?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable ref={ref} testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityHint={accessibilityHint} accessibilityState={{ disabled: Boolean(disabled), expanded }}
      disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={({ pressed }) => [styles.button, compact && styles.buttonCompact, secondary && styles.buttonSecondary, focused && styles.focused,
        pressed && styles.pressed, disabled && (secondary ? styles.buttonSecondaryDisabled : styles.buttonDisabled)]}>
      <Text style={[styles.buttonLabel, compact && styles.buttonLabelCompact, secondary && styles.buttonLabelSecondary,
        disabled && !secondary && styles.buttonLabelDisabled]}>{label}</Text>
    </Pressable>
  );
}

function TaskRow({ task, onPress }: { task: { id: string; title: string; detail: string; done: boolean }; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: task.done }}
      accessibilityLabel={`${task.title}. ${task.detail}`}
      accessibilityHint="Altera apenas esta tarefa fictícia; toque novamente para desfazer."
      onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={({ pressed }) => [styles.task, task.done && styles.taskDone, focused && styles.focused, pressed && styles.pressed]}>
      <Ionicons accessible={false} name={task.done ? "checkbox" : "square-outline"} size={26} color={task.done ? colors.green : colors.wine} />
      <View style={[styles.flexible, styles.tight]}>
        <Text style={styles.strong}>{task.title}</Text>
        <Text style={styles.small}>{task.detail}</Text>
        <Text style={styles.small}>{task.done ? "Concluída no exemplo · toque para desfazer" : "A fazer no exemplo"}</Text>
      </View>
    </Pressable>
  );
}

export function TaskList() {
  const { tasks, toggleTask } = useDemo();
  return <View style={styles.stack}>{tasks.map((task) => <TaskRow key={task.id} task={task} onPress={() => toggleTask(task.id)} />)}</View>;
}
