// Chủ đề giao diện: mặc định Hồng nơ, đổi được sang Xanh trắng. Lựa chọn lưu riêng trên từng máy.
export type ThemeName = "pink" | "blue";
export const DEFAULT_THEME: ThemeName = "pink";

export function parseTheme(raw: string | null): ThemeName {
  return raw === "blue" || raw === "pink" ? raw : DEFAULT_THEME;
}

export type Palette = {
  bg: string; // nền trang
  surface: string; // thẻ, ô nhập
  line: string; // viền
  accent: string; // điểm nhấn chính (nút, tab đang mở)
  accentDeep: string; // nền chữ trắng trên nút
  accentSoft: string; // nền nhạt của điểm nhấn
  hubFrom: string; // đầu dải màu nút Hub
  gradFrom: string; // dải màu logo: đầu
  gradTo: string; // dải màu logo: cuối
  ink: string; // chữ chính
  muted: string; // chữ phụ
  onAccent: string; // chữ trên nền accentDeep
  amber: string;
  amberSoft: string;
  red: string;
  redSoft: string;
  green: string;
  greenSoft: string;
};

const status = {
  amber: "#8F530A",
  amberSoft: "#FDEFD9",
  red: "#B83232",
  redSoft: "#FCE9E9",
  green: "#146F4D",
  greenSoft: "#E2F5EC",
};

export const PALETTES: Record<ThemeName, Palette> = {
  pink: {
    bg: "#FFF5F8",
    surface: "#FFFFFF",
    line: "#F6D3E0",
    accent: "#E0508A",
    accentDeep: "#BE356B",
    accentSoft: "#FDE6EF",
    hubFrom: "#F48DB7",
    gradFrom: "#F9A8C9",
    gradTo: "#D23B76",
    ink: "#4A2235",
    muted: "#946478",
    onAccent: "#FFFFFF",
    ...status,
  },
  blue: {
    bg: "#F5F8FC",
    surface: "#FFFFFF",
    line: "#DCE5F0",
    accent: "#1D6FE0",
    accentDeep: "#1450B0",
    accentSoft: "#E8F1FD",
    hubFrom: "#3B8BF0",
    gradFrom: "#4FA3F7",
    gradTo: "#1450B0",
    ink: "#102A43",
    muted: "#5A6E87",
    onAccent: "#FFFFFF",
    ...status,
  },
};
