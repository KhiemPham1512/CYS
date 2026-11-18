// Người dùng bị khóa vẫn giữ phiên cũ tới khi token hết hạn; RLS đã chặn dữ liệu,
// nên app tự phát hiện để đăng xuất ngay thay vì chạy "như bình thường".
export type MembershipStatus = "active" | "locked" | "unknown";

export function membershipStatus(result: {
  data: unknown;
  error: { message: string } | null;
}): MembershipStatus {
  if (result.error) return "unknown"; // lỗi mạng: không đăng xuất nhầm
  return result.data ? "active" : "locked"; // RLS giấu dòng của người bị khóa
}

// Tên kênh realtime riêng cho từng Người dùng; trigger members_notify_locked gửi vào đây.
export const lockTopic = (userId: string) => `user-lock:${userId}`;
