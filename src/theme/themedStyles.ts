import { StyleSheet } from "react-native";
import { PALETTES, type Palette, type ThemeName } from "./themes";

type Styles = Parameters<typeof StyleSheet.create>[0];

// Style theo chủ đề cho các màn cũ: viết `themedStyles((c) => ({ ... }))` thay cho StyleSheet.create,
// dùng bảng màu `c` của chủ đề đang chọn. Code dùng `styles.x` giữ nguyên.
// ThemeProvider gán chủ đề đang chọn mỗi lần render; khi đổi chủ đề, App dựng lại các màn (đổi key).
let active: ThemeName = "pink";
export function setActiveTheme(t: ThemeName) {
  active = t;
}

export function themedStyles<S extends Styles>(
  make: (c: Palette) => S & Styles
): Readonly<S> {
  const cache = new Map<ThemeName, Readonly<S>>();
  return new Proxy({} as Readonly<S>, {
    get(_target, key) {
      let sheet = cache.get(active);
      if (!sheet) {
        sheet = StyleSheet.create(make(PALETTES[active]));
        cache.set(active, sheet);
      }
      return (sheet as Record<string | symbol, unknown>)[key];
    },
  });
}

// Màu đường ray của công tắc theo chủ đề đang chọn.
export function switchTrack() {
  const c = PALETTES[active];
  return { false: "#9CA3AF", true: c.accentDeep }; // ray tắt xám trung tính, đủ thấy trên nền trắng
}
