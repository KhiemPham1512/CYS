import { Alert, Platform } from "react-native";

export type ConfirmRequest = {
  title: string;
  message?: string;
  confirmText: string;
  destructive?: boolean;
  onConfirm: () => void;
};

// ConfirmHost (gắn một lần ở App) đăng ký ở đây để hộp xác nhận đúng giao diện app, cả điện thoại lẫn web.
let host: ((request: ConfirmRequest) => void) | null = null;
export function registerConfirmHost(show: (request: ConfirmRequest) => void) {
  host = show;
  return () => {
    if (host === show) host = null;
  };
}

export function confirmAction(opts: ConfirmRequest) {
  if (host) {
    host(opts);
    return;
  }
  // Chưa có host (ví dụ lúc đang dựng app): dùng hộp của hệ thống.
  if (Platform.OS === "web") {
    const text = opts.message ? `${opts.title}\n\n${opts.message}` : opts.title;
    if (globalThis.confirm?.(text)) opts.onConfirm();
    return;
  }
  Alert.alert(opts.title, opts.message, [
    { text: "Hủy", style: "cancel" },
    {
      text: opts.confirmText,
      style: opts.destructive ? "destructive" : "default",
      onPress: opts.onConfirm,
    },
  ]);
}
