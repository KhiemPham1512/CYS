import { createContext, useContext } from "react";
import { StyleSheet, Text as RNText, type TextProps } from "react-native";
import { fontFamily } from "./motion";

// Chữ lồng trong chữ khác thì thừa hưởng font của chữ cha (RN tự làm), chỉ đặt font khi có độ đậm riêng.
const InsideText = createContext(false);

// Text dùng font Be Vietnam Pro: chọn đúng bản theo độ đậm (fontWeight) trong style cũ,
// để các màn cũ không phải sửa từng chỗ. Android không ghép được fontWeight với font tùy chỉnh nên đặt "normal".
export function Text({ style, ...rest }: TextProps) {
  const nested = useContext(InsideText);
  const w = StyleSheet.flatten(style)?.fontWeight;
  const hasWeight = w !== undefined && w !== "normal" && w !== "400";
  const family =
    w === "700" || w === "800" || w === "900" || w === "bold"
      ? fontFamily.bold
      : w === "600"
        ? fontFamily.semi
        : w === "500"
          ? fontFamily.medium
          : fontFamily.regular;
  const own = nested && !hasWeight ? undefined : { fontFamily: family };
  return (
    <InsideText.Provider value>
      <RNText
        {...rest}
        style={[own, style, own ? { fontWeight: "normal" } : undefined]}
      />
    </InsideText.Provider>
  );
}
