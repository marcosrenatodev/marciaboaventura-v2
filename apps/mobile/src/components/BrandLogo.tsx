import { Image, StyleSheet } from "react-native";
import logo from "../../assets/brand/logo-mb.png";

export function BrandLogo({ size = "compact" }: { size?: "compact" | "regular" }) {
  return (
    <Image
      accessible
      accessibilityLabel="Logotipo MB Advocacia de Márcia Boaventura"
      source={logo}
      resizeMode="contain"
      style={[styles.logo, size === "regular" ? styles.regular : styles.compact]}
    />
  );
}

const styles = StyleSheet.create({
  logo: { flexShrink: 0 },
  compact: { width: 92, height: 42 },
  regular: { width: 112, height: 51 },
});
