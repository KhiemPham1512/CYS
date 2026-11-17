// null = NetInfo chưa đo xong; không chặn để app không báo mất mạng giả lúc mới mở.
export function isOffline(state: {
  isConnected: boolean | null;
  isInternetReachable?: boolean | null;
}): boolean {
  return state.isConnected === false || state.isInternetReachable === false;
}
