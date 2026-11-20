import { StyleSheet, Text as RNText, type TextProps } from "react-native";
import { fontFamily } from "./motion";

// Text dùng font Be Vietnam Pro: chọn đúng bản theo độ đậm (fontWeight) trong style cũ,
// để các màn cũ không phải sửa từng chỗ. Android không ghép được fontWeight với font tùy chỉnh nên đặt "normal".
export function Text({ style, ...rest }: TextProps) {
  const w = StyleSheet.flatten(style)?.fontWeight;
  const family =
    w === "700" || w === "800" || w === "900" || w === "bold"
      ? fontFamily.bold
      : w === "600"
        ? fontFamily.semi
        : w === "500"
          ? fontFamily.medium
          : fontFamily.regular;
  return (
    <RNText
      {...rest}
      style={[{ fontFamily: family }, style, { fontWeight: "normal" }]}
    />
  );
}
