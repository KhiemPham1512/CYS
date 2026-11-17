import { useEffect } from "react";
import { AppState } from "react-native";
import { lockTopic, membershipStatus } from "./membership";
import { supabase } from "./supabase";

const RECHECK_MS = 2 * 60 * 1000;

// Gọi onLocked khi Người dùng đang đăng nhập bị khóa: nhận tín hiệu realtime,
// kiểm lại khi app mở lên lại và định kỳ (phòng mất tín hiệu).
export function useLockWatch(userId: string, onLocked: () => void) {
  useEffect(() => {
    let stopped = false;
    async function check() {
      const res = await supabase
        .from("members")
        .select("user_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (!stopped && membershipStatus(res) === "locked") onLocked();
    }

    // Tín hiệu chỉ là gợi ý: luôn kiểm lại bằng RLS trước khi đăng xuất.
    const channel = supabase
      .channel(lockTopic(userId))
      .on("broadcast", { event: "locked" }, () => void check())
      .subscribe();
    const appState = AppState.addEventListener("change", (s) => {
      if (s === "active") void check();
    });
    const timer = setInterval(() => void check(), RECHECK_MS);
    void check();

    return () => {
      stopped = true;
      clearInterval(timer);
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [userId, onLocked]);
}
