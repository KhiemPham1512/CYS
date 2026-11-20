import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

// Khi điện thoại bật "Giảm chuyển động": bỏ nảy/trượt, chỉ còn mờ dần rất ngắn.
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduce)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduce
    );
    return () => sub.remove();
  }, []);
  return reduce;
}

export const fontFamily = {
  regular: "BeVietnamPro_400Regular",
  medium: "BeVietnamPro_500Medium",
  semi: "BeVietnamPro_600SemiBold",
  bold: "BeVietnamPro_700Bold",
};
