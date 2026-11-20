import { useRef, useState, type RefObject } from "react";
import { Platform, Text, View, type TextInputInstance, type ViewInstance } from "react-native";
import { TourAnchor } from "@/TourAnchors";
import { courtsWithOfficialPortals } from "@/court-portal-options";
import { colors, styles } from "@/theme";
import { AccessibleTextInput } from "@/components/AccessibleTextInput";
import { ActionButton } from "@/components/Ui";

export function CourtPicker({ courtName, jurisdiction, triggerRef, onSelect }: {
  courtName: string;
  jurisdiction: string;
  triggerRef: RefObject<ViewInstance | null>;
  onSelect: (name: string, jurisdiction: string) => void;
}) {
  const [mode, setMode] = useState<"closed" | "list" | "custom">("closed");
  const [customName, setCustomName] = useState("");
  const [customRegion, setCustomRegion] = useState("");
  const customNameRef = useRef<TextInputInstance>(null);
  const knownCourt = courtsWithOfficialPortals.find((court) => court.code === courtName || court.name === courtName);
  const selectedLabel = knownCourt?.code ?? courtName;

  const select = (name: string, jurisdiction: string) => {
    onSelect(name, jurisdiction);
    setMode("closed");
    if (Platform.OS === "web") triggerRef.current?.focus();
  };

  return <View style={styles.tight}>
    <Text style={styles.strong}>Tribunal</Text>
    <TourAnchor id="cases.tribunal">
      <ActionButton ref={triggerRef} testID="court-picker-trigger"
        label={selectedLabel || "Selecionar tribunal"}
        accessibilityLabel={selectedLabel ? `Selecionar tribunal do processo. Atual: ${selectedLabel}` : "Selecionar tribunal do processo"}
        expanded={mode !== "closed"} secondary onPress={() => setMode(mode === "closed" ? "list" : "closed")} />
    </TourAnchor>
    {mode === "list" ? <View style={styles.tight}>
      <Text style={styles.small}>Tribunais com atalho para consulta manual no portal oficial</Text>
      {courtsWithOfficialPortals.map((court) => <ActionButton key={court.code} testID={`court-option-${court.code}`}
        label={`${court.code} · ${court.name}`} secondary onPress={() => select(court.name, court.jurisdiction)} />)}
      <ActionButton label="+ Outro tribunal" secondary onPress={() => {
        setCustomName(knownCourt ? "" : courtName);
        setCustomRegion(knownCourt ? "" : jurisdiction);
        setMode("custom");
        if (Platform.OS === "web") requestAnimationFrame(() => customNameRef.current?.focus());
      }} />
    </View> : null}
    {mode === "custom" ? <View style={styles.tight}>
      <Text style={styles.strong}>Outro tribunal</Text>
      <AccessibleTextInput ref={customNameRef} testID="court-name-input" accessibilityLabel="Nome do outro tribunal" placeholder="Nome do tribunal" placeholderTextColor={colors.muted}
        value={customName} onChangeText={setCustomName} maxLength={160} style={styles.input} />
      <AccessibleTextInput accessibilityLabel="Estado ou região do outro tribunal, opcional" placeholder="Estado ou região (opcional)" placeholderTextColor={colors.muted}
        value={customRegion} onChangeText={setCustomRegion} maxLength={120} style={styles.input} />
      <ActionButton label="Usar tribunal" disabled={!customName.trim()} onPress={() => select(customName.trim(), customRegion.trim())} />
      <ActionButton label="Voltar à lista de tribunais" secondary onPress={() => {
        setMode("list");
        if (Platform.OS === "web") triggerRef.current?.focus();
      }} />
    </View> : null}
  </View>;
}
