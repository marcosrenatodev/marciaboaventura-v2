import { AccessibleTextInput } from "@/components/AccessibleTextInput";
import { SecretTextInput } from "@/components/SecretTextInput";
import { BrandLogo } from "@/components/BrandLogo";
import { useState, type PropsWithChildren } from "react";
import { Link, type Href } from "expo-router";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, headingFont } from "@/theme";

export function AuthFrame({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle: string }>) {
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.brandLockup}>
            <BrandLogo size="regular" />
            <View style={styles.brandDivider} />
            <View style={styles.brandCopy}>
              <Text style={styles.brand}>MÁRCIA BOAVENTURA</Text>
              <Text style={styles.brandCaption}>ADVOCACIA</Text>
            </View>
          </View>
          <Text testID={title === "Bem-vinda" ? "auth-welcome-title" : undefined} accessibilityRole="header" style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Field({ label, value, onChangeText, secureTextEntry, keyboardType, autoCapitalize = "none", textContentType, hint, feedback }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "number-pad";
  autoCapitalize?: "none" | "words" | "characters";
  textContentType?: "password" | "newPassword";
  hint?: string;
  feedback?: { message: string; met: boolean; progress?: number };
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {secureTextEntry ? <SecretTextInput
        fieldLabel={label}
        accessibilityLabel={label}
        accessibilityHint={hint}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        textContentType={textContentType ?? "password"}
        style={styles.input}
        placeholderTextColor={colors.muted}
      /> : <AccessibleTextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        textContentType={textContentType ?? (keyboardType === "email-address" ? "emailAddress" : "none")}
        style={styles.input}
        placeholderTextColor={colors.muted}
      />}
      {feedback ? (
        <View style={styles.field}>
          {feedback.progress !== undefined ? (
            <View aria-hidden style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${feedback.progress * 100}%` }, feedback.met && styles.progressMet]} />
            </View>
          ) : null}
          <Text style={[styles.feedback, feedback.met && styles.feedbackMet]}>{feedback.message}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function AuthButton({ label, onPress, secondary, disabled, testID }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean; testID?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
      onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, focused && styles.focused, pressed && styles.pressed,
        disabled && (secondary ? styles.disabledSecondary : styles.disabled)]}>
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary, disabled && !secondary && styles.buttonTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

export function AuthLink({ href, children }: PropsWithChildren<{ href: "/" | "/login" | "/setup" | "/forgot-password" | "/reset-password" }>) {
  return <Link href={href as Href} accessibilityRole="link" style={styles.link}>{children}</Link>;
}

export function StatusMessage({ children }: PropsWithChildren) {
  return <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.message}>{children}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 520, alignSelf: "center", backgroundColor: colors.paper, borderColor: colors.line, borderWidth: 1, borderRadius: 20, padding: 24, gap: 16 },
  brandLockup: { minHeight: 51, flexDirection: "row", alignItems: "center", gap: 12 },
  brandDivider: { alignSelf: "stretch", width: 2, backgroundColor: colors.gold },
  brandCopy: { gap: 3 },
  brand: { color: colors.wine, fontSize: 13, fontWeight: "800", letterSpacing: 1.1 },
  brandCaption: { color: colors.focus, fontSize: 11, fontWeight: "700", letterSpacing: 1.6 },
  title: { color: colors.ink, fontFamily: headingFont, fontSize: 30, fontWeight: "700" },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  field: { gap: 7 },
  label: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  feedback: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  feedbackMet: { color: colors.green, fontWeight: "600" },
  progressTrack: { height: 4, borderRadius: 2, overflow: "hidden", backgroundColor: colors.line },
  progressFill: { height: 4, backgroundColor: colors.wine },
  progressMet: { backgroundColor: colors.green },
  input: { minHeight: 52, borderWidth: 2, borderColor: colors.controlLine, borderRadius: 10, color: colors.ink, backgroundColor: colors.paper, paddingHorizontal: 14, fontSize: 16 },
  button: { minHeight: 54, borderWidth: 2, borderColor: colors.goldDark, borderRadius: 10, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  buttonSecondary: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.wine },
  buttonText: { color: colors.goldForeground, fontSize: 16, fontWeight: "700", textAlign: "center" },
  buttonTextSecondary: { color: colors.wine },
  buttonTextDisabled: { color: colors.paper },
  focused: { borderWidth: 3, borderColor: colors.focus },
  pressed: { transform: [{ scale: 0.99 }] },
  disabled: { opacity: 1, backgroundColor: colors.disabledPrimary, borderColor: colors.controlLine },
  disabledSecondary: { opacity: 1, backgroundColor: colors.disabledSecondary, borderColor: colors.controlLine },
  link: { color: colors.wine, textDecorationLine: "underline", fontSize: 15, fontWeight: "700", alignSelf: "flex-start", paddingVertical: 10 },
  message: { color: colors.wine, backgroundColor: colors.wineWash, borderRadius: 8, padding: 12, fontSize: 15, lineHeight: 22 },
});
