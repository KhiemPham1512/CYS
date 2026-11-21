import { supabase } from "./supabase";

// Nghe mọi thay đổi (realtime) của các bảng thuộc một Chi nhánh; trả hàm gỡ đăng ký.
// Tên kênh có hậu tố ngẫu nhiên: supabase-js trả lại kênh cũ nếu trùng tên, mất lần đăng ký mới.
export function subscribeTables(
  prefix: string,
  branchId: string,
  tables: string[],
  onChange: () => void
): () => void {
  const channel = supabase.channel(
    `${prefix}-${branchId}-${Math.random().toString(36).slice(2)}`
  );
  for (const table of tables) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
        filter: `branch_id=eq.${branchId}`,
      },
      onChange
    );
  }
  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
