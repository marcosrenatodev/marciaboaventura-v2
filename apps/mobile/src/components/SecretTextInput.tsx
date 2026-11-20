import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, StyleSheet, View, type TextInputProps } from "react-native";
import { colors } from "@/theme";
import { AccessibleTextInput } from "./AccessibleTextInput";

type SecretTextInputProps = Omit<TextInputProps, "secureTextEntry"> & {
  /** Short, human-readable field name used for the show/hide button's screen-reader label. */
  fieldLabel: string;
};

export function SecretTextInput({ fieldLabel, accessibilityLabel, style, testID, ...inputProps }: SecretTextInputProps) {
  const [visible, setVisible] = useState(false);
  const [toggleFocused, setToggleFocused] = useState(false);
  const subject = fieldLabel.toLocaleLowerCase("pt-BR");

  return (
    <View style={styles.wrapper}>
      <AccessibleTextInput
        {...inputProps}
        accessibilityLabel={accessibilityLabel ?? fieldLabel}
        testID={testID}
        secureTextEntry={!visible}
        style={[style, styles.inputWithToggle]}
      />
      <Pressable
        testID={testID ? `${testID}-visibility-toggle` : undefined}
        accessibilityRole="button"
        accessibilityLabel={`${visible ? "Ocultar" : "Mostrar"} ${subject}`}
        accessibilityHint={visible ? "Oculta o conteúdo deste campo na tela." : "Exibe o conteúdo deste campo na tela."}
        onPress={() => setVisible((current) => !current)}
        onFocus={() => setToggleFocused(true)}
        onBlur={() => setToggleFocused(false)}
        style={({ pressed }) => [styles.toggle, toggleFocused && styles.toggleFocused, pressed && styles.pressed]}
      >
        <Ionicons accessible={false} name={visible ? "eye-off-outline" : "eye-outline"} size={22} color={colors.wine} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: "100%", position: "relative" },
  inputWithToggle: { paddingRight: 62 },
  toggle: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 48,
    height: 48,
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
  },
  toggleFocused: { borderColor: colors.focus },
  pressed: { opacity: 0.72 },
});
