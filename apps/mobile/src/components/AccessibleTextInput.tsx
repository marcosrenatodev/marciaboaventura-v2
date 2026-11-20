import { forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Keyboard, Platform, TextInput, type TextInputInstance, type TextInputProps } from "react-native";
import { TourScrollContext, type TourMeasure } from "@/TourAnchors";
import { colors } from "@/theme";

/** Keeps keyboard focus visible across web and native screens. */
export const AccessibleTextInput = forwardRef<TextInputInstance, TextInputProps>(function AccessibleTextInput(
  { style, onFocus, onBlur, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInputInstance | null>(null);
  const scroller = useContext(TourScrollContext);
  const measureInput = useCallback<TourMeasure>(() => new Promise((resolve) => {
    const input = inputRef.current as (TextInputInstance & {
      measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void;
    }) | null;
    if (!input?.measureInWindow) {
      resolve(null);
      return;
    }
    input.measureInWindow((x, y, width, height) => {
      resolve([x, y, width, height].every(Number.isFinite) ? { x, y, width, height } : null);
    });
  }), []);

  useImperativeHandle(ref, () => inputRef.current as TextInputInstance, []);

  useEffect(() => {
    if (!focused || Platform.OS === "web" || !scroller) return;
    const ensureInputVisible = (keyboardScreenY?: number) => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        void scroller.ensureVisible(measureInput, keyboardScreenY);
      }));
    };
    const keyboardSubscription = Keyboard.addListener("keyboardDidShow", (event) => ensureInputVisible(event.endCoordinates.screenY));
    const fallback = setTimeout(ensureInputVisible, 320);
    return () => {
      keyboardSubscription.remove();
      clearTimeout(fallback);
    };
  }, [focused, measureInput, scroller]);

  return <TextInput
    {...props}
    ref={inputRef}
    onFocus={(event) => { setFocused(true); onFocus?.(event); }}
    onBlur={(event) => { setFocused(false); onBlur?.(event); }}
    style={[style, focused && { borderColor: colors.focus }]}
  />;
});
