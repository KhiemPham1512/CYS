import { useNetInfo } from "@react-native-community/netinfo";
import { isOffline } from "./network";

// Mọi nút ghi dữ liệu dùng hook này để khóa khi mất mạng (app online-only).
export function useOnline(): boolean {
  return !isOffline(useNetInfo());
}
