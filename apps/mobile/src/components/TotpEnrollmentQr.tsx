import { useMemo } from "react";
import createQrCode from "qrcode-generator";
import { Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { styles } from "@/theme";

function encodeQr(uri: string) {
  const matrix = createQrCode(0, "M");
  matrix.addData(uri);
  matrix.make();

  const quietZone = 4;
  const modules = matrix.getModuleCount();
  const path: string[] = [];
  for (let row = 0; row < modules; row++) {
    for (let column = 0; column < modules; column++) {
      if (matrix.isDark(row, column)) {
        path.push(`M${column + quietZone} ${row + quietZone}h1v1h-1z`);
      }
    }
  }
  return { path: path.join(" "), size: modules + 2 * quietZone };
}

export function TotpEnrollmentQr({ uri }: { uri: string }) {
  const qr = useMemo(() => {
    try {
      return encodeQr(uri);
    } catch {
      return null;
    }
  }, [uri]);

  if (!qr) return <Text style={styles.small}>Não foi possível gerar o QR code. Use a chave manual abaixo.</Text>;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel="QR code para configurar o aplicativo autenticador"
      style={{ width: "100%", maxWidth: 240, aspectRatio: 1 }}>
      <Svg aria-hidden width="100%" height="100%" viewBox={`0 0 ${qr.size} ${qr.size}`}>
        <Rect width={qr.size} height={qr.size} fill="#fff" />
        <Path d={qr.path} fill="#000" />
      </Svg>
    </View>
  );
}
