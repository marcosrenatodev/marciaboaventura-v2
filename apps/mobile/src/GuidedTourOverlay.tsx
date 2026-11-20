import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { usePathname, useRouter, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "@/auth";
import { useWorkData } from "@/work-api";
import { colors, styles } from "@/theme";
import { TourSpotlight } from "@/TourSpotlight";
import { TourHelpActionContext } from "@/TourHelpAction";

const guidedTourSteps = [
  {
    screenId: "today",
    title: "Hoje",
    route: "/(tabs)" as const,
    purpose: "Comece pelo que pede atenção e veja tarefas e compromissos próximos.",
    action: "Abra a agenda para organizar um próximo passo ou compromisso.",
    limit: "Uma tarefa organiza o trabalho; ela não confirma prazo processual.",
  },
  {
    screenId: "cases",
    title: "Processos",
    route: "/processos" as const,
    purpose: "Organize clientes, assuntos e processos do escritório em um só lugar.",
    action: "Cadastre os dados manualmente e relacione um processo ao assunto correspondente.",
    limit: "Confira número, tribunal e andamento na fonte oficial antes de tomar uma decisão.",
  },
  {
    screenId: "calendar",
    title: "Agenda",
    route: "/agenda" as const,
    purpose: "Planeje tarefas e compromissos em lista ou calendário.",
    action: "Use Novo compromisso na agenda; para próximos passos, troque para Tarefas e escolha Nova tarefa. No calendário, você também pode criar algo diretamente para o dia selecionado.",
    limit: "A data é um lembrete de organização, não um prazo judicial confirmado.",
  },
  {
    screenId: "finance",
    title: "Financeiro",
    route: "/financeiro" as const,
    purpose: "Acompanhe honorários e despesas que você registrou.",
    action: "Cadastre o valor, a categoria e a situação para consultar o resumo do escritório.",
    limit: "Este controle simples não substitui contabilidade, nota fiscal ou conciliação bancária.",
  },
  {
    screenId: "research",
    title: "Pesquisa",
    route: "/pesquisa" as const,
    purpose: "Prepare uma busca jurídica e abra o portal oficial escolhido.",
    action: "Copie os termos, consulte a fonte e salve a pesquisa para encontrá-la depois.",
    limit: "O app não garante cobertura nem valida a decisão; confira o conteúdo original no tribunal.",
  },
  {
    screenId: "files",
    title: "Arquivos",
    route: "/arquivos" as const,
    purpose: "Guarde PDFs e importe arquivos que você selecionar do Drive conectado.",
    action: "Abra Adicionar documento, escolha um PDF do aparelho ou de uma conta conectada e confira o vínculo antes de guardar a cópia privada.",
    limit: "Só conecte uma conta depois de conferir as permissões e a origem do documento.",
  },
] as const;

type TourStep = (typeof guidedTourSteps)[number];

export function GuidedTourOverlay({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();
  const { demoMode } = useAuth();
  const api = useWorkData();
  const markGuidedTourScreenSeen = api.markGuidedTourScreenSeen;
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);
  const [helpFocused, setHelpFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [screenGuide, setScreenGuide] = useState<{ accountKey: string; screenId: TourStep["screenId"] } | null>(null);
  const [dismissedScreenGuideKeys, setDismissedScreenGuideKeys] = useState<string[]>([]);
  const attemptedScreenSeen = useRef(new Set<string>());
  const inFlightScreenSeen = useRef(new Map<string, Promise<boolean>>());
  const completedScreenSeen = useRef(new Set<string>());
  const spotlightedScreenKeys = useRef(new Set<string>());
  const [screenSeenErrorKey, setScreenSeenErrorKey] = useState<string | null>(null);
  const routedTourProgress = useRef<string | null>(null);
  const pendingTourRoute = useRef<string | null>(null);
  const tenantId = api.sessionInfo?.tenant.id ?? null;
  const userId = typeof api.sessionInfo?.user.id === "string" ? api.sessionInfo.user.id : null;
  const accountKey = tenantId && userId ? `${tenantId}:${userId}` : null;
  const progress = api.guidedTour;
  const step = progress ? guidedTourSteps[progress.stepIndex] : undefined;
  const isOnTourStepRoute = Boolean(step && (pathname === step.route || (step.route === "/(tabs)" && pathname === "/")));
  const currentStep = guidedTourSteps.find((candidate) => candidate.route === pathname || (candidate.route === "/(tabs)" && pathname === "/"));
  const showHelp = Boolean(!demoMode && accountKey && api.guidedTourReady);
  const visible = Boolean(
    !demoMode && accountKey && !api.loading && progress?.status === "in_progress" &&
    progress.updatedAt && dismissedAt !== progress.updatedAt && isOnTourStepRoute,
  );
  const automaticGuideKey = accountKey && currentStep ? `${accountKey}:${currentStep.screenId}` : null;
  const autoScreenGuide = Boolean(!demoMode && accountKey && !api.loading && api.guidedTourReady && api.guidedTourScreenProgressReady && (progress?.status === "skipped" || progress?.status === "completed") && currentStep && !api.guidedTourScreenIds.includes(currentStep.screenId) && automaticGuideKey && !dismissedScreenGuideKeys.includes(automaticGuideKey));
  const manualScreenGuide = screenGuide?.accountKey === accountKey && currentStep?.screenId === screenGuide.screenId ? screenGuide : null;
  const effectiveScreenGuideId = manualScreenGuide?.screenId ?? (autoScreenGuide ? currentStep?.screenId ?? null : null);
  const screenGuideStep = effectiveScreenGuideId ? guidedTourSteps.find((candidate) => candidate.screenId === effectiveScreenGuideId) : undefined;
  const showScreenGuide = Boolean(screenGuideStep);
  const displayedStep = screenGuideStep ?? step;
  const isScreenGuide = Boolean(screenGuideStep);
  const guideIsVisible = Boolean((visible && step && progress) || (showScreenGuide && screenGuideStep));

  const persistScreenSeen = useCallback(async (screenId: TourStep["screenId"], retry = false) => {
    if (!accountKey) return false;
    const key = `${accountKey}:${screenId}`;
    if (completedScreenSeen.current.has(key) || api.guidedTourScreenIds.includes(screenId)) return true;
    const inFlight = inFlightScreenSeen.current.get(key);
    if (inFlight) return inFlight;
    if (!retry && attemptedScreenSeen.current.has(key)) return false;
    attemptedScreenSeen.current.add(key);
    setScreenSeenErrorKey(null);
    setMessage("");
    const operation = (async () => {
      try {
        await markGuidedTourScreenSeen(screenId);
        completedScreenSeen.current.add(key);
        setScreenSeenErrorKey(null);
        return true;
      } catch (error) {
        setScreenSeenErrorKey(key);
        setMessage(error instanceof Error ? error.message : "Não foi possível salvar esta orientação. Tente novamente.");
        return false;
      } finally {
        inFlightScreenSeen.current.delete(key);
      }
    })();
    inFlightScreenSeen.current.set(key, operation);
    return operation;
  }, [accountKey, api.guidedTourScreenIds, markGuidedTourScreenSeen]);

  const onSpotlightReady = useCallback(() => {
    if (!guideIsVisible || !displayedStep || !accountKey) return;
    const key = `${accountKey}:${displayedStep.screenId}`;
    spotlightedScreenKeys.current.add(key);
    if (!isScreenGuide || manualScreenGuide) void persistScreenSeen(displayedStep.screenId);
  }, [accountKey, displayedStep, guideIsVisible, isScreenGuide, manualScreenGuide, persistScreenSeen]);

  const retryScreenSeen = useCallback(() => {
    if (!displayedStep) return;
    void persistScreenSeen(displayedStep.screenId, true);
  }, [displayedStep, persistScreenSeen]);

  useEffect(() => {
    if (progress?.status !== "in_progress" || !step || !progress.updatedAt || !accountKey) return;
    const routeKey = `${accountKey}:${progress.stepIndex}:${progress.updatedAt}`;
    const isOnStepRoute = pathname === step.route || (step.route === "/(tabs)" && pathname === "/");
    if (routedTourProgress.current !== routeKey) {
      routedTourProgress.current = routeKey;
      pendingTourRoute.current = null;
      if (!isOnStepRoute) {
        pendingTourRoute.current = step.route;
        router.replace(step.route as Href);
      }
      return;
    }

    const expectedRoute = pendingTourRoute.current;
    if (expectedRoute && (pathname === expectedRoute || (expectedRoute === "/(tabs)" && pathname === "/"))) {
      pendingTourRoute.current = null;
      return;
    }

    if (expectedRoute) pendingTourRoute.current = null;
  }, [accountKey, pathname, progress?.status, progress?.stepIndex, progress?.updatedAt, router, step]);

  async function saveProgress(status: "in_progress" | "skipped" | "completed", stepIndex: number) {
    setSaving(true);
    setMessage("");
    try {
      await api.saveGuidedTourProgress(status, stepIndex);
      if (status !== "in_progress") setDismissedAt(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar esta etapa. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  function openScreenGuide(target: TourStep) {
    setMessage("");
    setScreenSeenErrorKey(null);
    if (accountKey) setScreenGuide({ accountKey, screenId: target.screenId });
  }

  async function openFullTour() {
    if (isScreenGuide && displayedStep && accountKey && spotlightedScreenKeys.current.has(`${accountKey}:${displayedStep.screenId}`)) {
      const saved = await persistScreenSeen(displayedStep.screenId);
      if (!saved) return;
    }
    try {
      await api.replayGuidedTour();
      setScreenGuide(null);
      setMessage("");
      setDismissedAt(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível abrir o tour completo agora.");
    }
  }

  const guideInstanceKey = displayedStep && accountKey
    ? `${accountKey}:${isScreenGuide ? `screen:${displayedStep.screenId}` : `tour:${progress?.stepIndex ?? 0}:${progress?.updatedAt ?? ""}`}`
    : "guide-pending";
  const screenSeenKey = displayedStep && accountKey ? `${accountKey}:${displayedStep.screenId}` : null;

  const closeGuide = async () => {
    if (isScreenGuide) {
      if (screenGuideStep && accountKey) {
        const key = `${accountKey}:${screenGuideStep.screenId}`;
        const wasSpotlighted = spotlightedScreenKeys.current.has(key);
        const alreadySeen = completedScreenSeen.current.has(key) || api.guidedTourScreenIds.includes(screenGuideStep.screenId);
        const previousAttemptFailed = screenSeenErrorKey === key;
        if (wasSpotlighted && !alreadySeen && !previousAttemptFailed) {
          const saved = await persistScreenSeen(screenGuideStep.screenId);
          if (!saved) return;
        }
        setDismissedScreenGuideKeys((current) => current.includes(key) ? current : [...current, key]);
      }
      if (automaticGuideKey) setDismissedScreenGuideKeys((current) => current.includes(automaticGuideKey) ? current : [...current, automaticGuideKey]);
      setScreenGuide(null);
    } else if (progress?.updatedAt) setDismissedAt(progress.updatedAt);
  };

  const skipTour = () => {
    if (progress) void saveProgress("skipped", progress.stepIndex);
  };

  const goBack = () => {
    if (progress && progress.stepIndex > 0) void saveProgress("in_progress", progress.stepIndex - 1);
  };

  const goNext = () => {
    if (!progress) return;
    const nextStepIndex = progress.stepIndex + 1;
    const completed = nextStepIndex === guidedTourSteps.length;
    void saveProgress(completed ? "completed" : "in_progress", completed ? guidedTourSteps.length - 1 : nextStepIndex);
  };

  const screenPersistenceError = Boolean(screenSeenKey && screenSeenErrorKey === screenSeenKey);
  const helpAction = showHelp && !guideIsVisible ? <View style={{ alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
    <Pressable testID="guided-tour-help" accessibilityRole="button"
      accessibilityLabel={progress?.status === "in_progress" ? "Retomar tour completo" : currentStep ? `Ajuda: ${currentStep.title}` : "Rever tour completo"}
      accessibilityHint={progress?.status === "in_progress" ? "Retoma as orientações que você ainda não concluiu." : "Mostra como usar esta tela e permite rever o tour completo."}
      onPress={() => {
        if (progress?.status === "in_progress") {
          setScreenGuide(null);
          setDismissedAt(null);
          if (step && !isOnTourStepRoute) {
            pendingTourRoute.current = step.route;
            router.replace(step.route as Href);
          }
        } else if (currentStep) openScreenGuide(currentStep);
        else void openFullTour();
      }} onFocus={() => setHelpFocused(true)} onBlur={() => setHelpFocused(false)}
      style={({ pressed }) => [{ minHeight: 48, minWidth: 96, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, borderWidth: 3, borderColor: "transparent", paddingHorizontal: 12, backgroundColor: colors.wineWash, alignSelf: "flex-end" }, helpFocused && styles.focused, pressed && styles.pressed]}>
      <Ionicons accessible={false} name="help-circle-outline" size={20} color={colors.wine} />
      <Text style={{ color: colors.wine, fontSize: 15, fontWeight: "700" }}>Ajuda</Text>
    </Pressable>
    {message && !visible && !showScreenGuide ? <Text accessibilityLiveRegion="polite" style={[styles.small, { maxWidth: 280, textAlign: "right", backgroundColor: colors.paper }]}>{message}</Text> : null}
  </View> : null;

  return (
    <TourHelpActionContext.Provider value={{ activeScreenId: currentStep?.screenId ?? null, action: helpAction }}>
      <View style={{ flex: 1 }}>
        {children}
        {guideIsVisible && displayedStep ? <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
          <TourSpotlight activeKey={guideInstanceKey} step={displayedStep} isScreenGuide={isScreenGuide}
            stepIndex={progress?.stepIndex ?? guidedTourSteps.findIndex((candidate) => candidate.screenId === displayedStep.screenId)} totalSteps={guidedTourSteps.length}
            saving={saving} message={message} persistenceError={screenPersistenceError} onClose={closeGuide} onSkip={skipTour} onBack={goBack}
            onNext={goNext} onViewFullTour={() => void openFullTour()} onRetryPersistence={retryScreenSeen} onSpotlightReady={onSpotlightReady} />
        </View> : null}
      </View>
    </TourHelpActionContext.Provider>
  );
}
