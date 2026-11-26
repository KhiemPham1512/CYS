import { useEffect } from "react";
import { AppState } from "react-native";
import { lockTopic, membershipStatus } from "./membership";
import { supabase } from "./supabase";

const RECHECK_MS = 2 * 60 * 1000;

// Gọi onLocked khi Người dùng đang đăng nhập bị khóa hoặc bị Chuyển quán: nhận tín hiệu realtime,
// kiểm lại khi app mở lên lại và định kỳ (phòng mất tín hiệu).
// branchId: quán đang mở; chưa biết thì chỉ kiểm còn là thành viên.
export function useLockWatch(
  userId: string,
  branchId: string | undefined,
  onLocked: () => void
) {
  useEffect(() => {
    let stopped = false;
    async function check() {
      // Phiên tạm trống (đang làm mới token) thì truy vấn chạy bằng anon → không được coi là bị khóa.
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      let query = supabase
        .from("members")
        .select("user_id")
        .eq("user_id", userId);
      // Chuyển quán chỉ đổi branch_id nên phải lọc theo quán đang mở mới phát hiện được.
      if (branchId) query = query.eq("branch_id", branchId);
      const res = await query.maybeSingle();
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
  }, [userId, branchId, onLocked]);
}
