import { Platform, StyleSheet } from "react-native";

export const colors = {
  canvas: "#f7f6f4", paper: "#ffffff", ink: "#282526", muted: "#655f5d",
  line: "#ded6d2", wine: "#702c3e", wineWash: "#f8eff1", focus: "#906515",
  attention: "#fff5e9", attentionInk: "#76502e", green: "#365b43", greenWash: "#edf4ee",
};

const headingFont = Platform.select({ ios: "Georgia", android: "serif", web: "Georgia, serif" });

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { width: "100%", maxWidth: 1080, alignSelf: "center", padding: 20, paddingBottom: 40, gap: 24 },
  demo: { backgroundColor: colors.attention, borderBottomWidth: 1, borderBottomColor: colors.line, paddingHorizontal: 20, paddingVertical: 10, gap: 3 },
  demoTitle: { color: colors.attentionInk, fontSize: 14, fontWeight: "700" },
  demoText: { color: colors.attentionInk, fontSize: 13 },
  brand: { color: colors.wine, fontSize: 14, fontWeight: "700" },
  title: { color: colors.ink, fontSize: 34, fontFamily: headingFont },
  heading: { color: colors.ink, fontSize: 24, fontFamily: headingFont },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  text: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  strong: { color: colors.ink, fontSize: 17, fontWeight: "600", lineHeight: 25 },
  small: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  eyebrow: { color: colors.wine, fontSize: 13, fontWeight: "700", letterSpacing: 0.7 },
  stack: { gap: 16 },
  tight: { gap: 6 },
  flexible: { flex: 1, minWidth: 0 },
  columns: { flexDirection: "row", alignItems: "flex-start", gap: 24 },
  mainColumn: { flex: 1.5, minWidth: 0, gap: 24 },
  sideColumn: { flex: 1, minWidth: 0, gap: 24 },
  card: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 20, gap: 16 },
  priority: { backgroundColor: colors.attention },
  badge: { alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, color: colors.wine, backgroundColor: colors.wineWash, fontSize: 14, fontWeight: "600" },
  button: { minHeight: 52, borderWidth: 3, borderColor: "transparent", borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, justifyContent: "center", alignItems: "center", backgroundColor: colors.wine },
  buttonSecondary: { backgroundColor: colors.wineWash },
  buttonLabel: { color: colors.paper, fontSize: 16, fontWeight: "700", textAlign: "center" },
  buttonLabelSecondary: { color: colors.wine },
  focused: { borderColor: colors.focus },
  pressed: { opacity: 0.75 },
  task: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderWidth: 3, borderColor: "transparent", borderRadius: 12, backgroundColor: colors.canvas },
  taskDone: { backgroundColor: colors.greenWash },
  input: { minHeight: 54, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 2, borderColor: colors.line, borderRadius: 12, color: colors.ink, backgroundColor: colors.paper, fontSize: 16 },
  divider: { height: 1, backgroundColor: colors.line },
  amount: { color: colors.wine, fontSize: 30, fontWeight: "600" },
  time: { color: colors.wine, fontSize: 18, fontWeight: "700" },
  notice: { color: colors.green, fontSize: 16, lineHeight: 24, fontWeight: "600" },
});
