import { Alert, Platform } from "react-native";

// Hộp xác nhận chạy cả trên điện thoại và web (Alert.alert của RN không làm gì trên web, nhân viên dùng iPhone qua Safari).
export function confirmAction(opts: {
  title: string;
  message?: string;
  confirmText: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
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
