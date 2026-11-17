import { useState, type PropsWithChildren } from "react";
import { Link } from "expo-router";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "@/theme";

export function AuthFrame({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle: string }>) {
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.brand}>MÁRCIA BOAVENTURA</Text>
          <Text testID={title === "Bem-vinda" ? "auth-welcome-title" : undefined} accessibilityRole="header" style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Field({ label, value, onChangeText, secureTextEntry, keyboardType, autoCapitalize = "none", hint }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "words";
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        textContentType={secureTextEntry ? "password" : keyboardType === "email-address" ? "emailAddress" : "none"}
        style={styles.input}
        placeholderTextColor={colors.muted}
      />
    </View>
  );
}

export function AuthButton({ label, onPress, secondary, disabled }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
      onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, focused && styles.focused, pressed && styles.pressed, disabled && styles.disabled]}>
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

export function AuthLink({ href, children }: PropsWithChildren<{ href: "/" | "/login" | "/setup" }>) {
  return <Link href={href} accessibilityRole="link" style={styles.link}>{children}</Link>;
}

export function StatusMessage({ children }: PropsWithChildren) {
  return <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.message}>{children}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 520, alignSelf: "center", backgroundColor: colors.paper, borderColor: colors.line, borderWidth: 1, borderRadius: 20, padding: 24, gap: 16 },
  brand: { color: colors.wine, fontSize: 13, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 30, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  field: { gap: 7 },
  label: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.line, borderRadius: 10, color: colors.ink, backgroundColor: colors.paper, paddingHorizontal: 14, fontSize: 16 },
  button: { minHeight: 54, borderRadius: 10, backgroundColor: colors.wine, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  buttonSecondary: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.wine },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", textAlign: "center" },
  buttonTextSecondary: { color: colors.wine },
  focused: { borderWidth: 3, borderColor: colors.focus },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.55 },
  link: { color: colors.wine, textDecorationLine: "underline", fontSize: 15, fontWeight: "700", alignSelf: "flex-start", paddingVertical: 10 },
  message: { color: colors.wine, backgroundColor: colors.wineWash, borderRadius: 8, padding: 12, fontSize: 15, lineHeight: 22 },
});
