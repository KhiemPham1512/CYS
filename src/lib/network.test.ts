import { describe, expect, it } from "vitest";
import { isOffline } from "./network";

describe("isOffline", () => {
  it("mất kết nối → offline", () => {
    expect(isOffline({ isConnected: false, isInternetReachable: null })).toBe(
      true
    );
  });

  it("có wifi nhưng không ra được internet → offline", () => {
    expect(isOffline({ isConnected: true, isInternetReachable: false })).toBe(
      true
    );
  });

  it("chưa biết trạng thái (lúc mới mở app) → không chặn", () => {
    expect(isOffline({ isConnected: null, isInternetReachable: null })).toBe(
      false
    );
  });

  it("có mạng → online", () => {
    expect(isOffline({ isConnected: true, isInternetReachable: true })).toBe(
      false
    );
  });
});
