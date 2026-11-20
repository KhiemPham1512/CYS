import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setActiveTheme } from "./themedStyles";
import {
  DEFAULT_THEME,
  PALETTES,
  parseTheme,
  type Palette,
  type ThemeName,
} from "./themes";

const KEY = "cys-theme";

type Ctx = {
  theme: ThemeName;
  palette: Palette;
  setTheme: (t: ThemeName) => void;
  ready: boolean; // đã đọc xong lựa chọn đã lưu (tránh nháy sai chủ đề lúc mở app)
};
const ThemeCtx = createContext<Ctx>({
  theme: DEFAULT_THEME,
  palette: PALETTES[DEFAULT_THEME],
  setTheme: () => {},
  ready: true,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(DEFAULT_THEME);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => setThemeState(parseTheme(raw)))
      .catch(() => {}) // không đọc được thì giữ mặc định
      .finally(() => setReady(true));
  }, []);

  const setTheme = useCallback((t: ThemeName) => {
    setThemeState(t);
    AsyncStorage.setItem(KEY, t).catch(() => {});
  }, []);

  setActiveTheme(theme); // trước khi các màn con dựng style
  const value = useMemo(
    () => ({ theme, palette: PALETTES[theme], setTheme, ready }),
    [theme, setTheme, ready]
  );
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
