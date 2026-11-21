import { beforeEach, describe, expect, it, vi } from "vitest";

// Ranh giới ngoài: giả lập kênh realtime của Supabase.
const on = vi.fn();
const subscribe = vi.fn();
const channel = vi.fn();
const removeChannel = vi.fn();
vi.mock("./supabase", () => ({ supabase: { channel, removeChannel } }));

const { subscribeTables } = await import("./subscribeTables");

beforeEach(() => {
  for (const f of [on, subscribe, channel, removeChannel]) f.mockReset();
  const ch = { on, subscribe };
  on.mockReturnValue(ch);
  subscribe.mockReturnValue(ch);
  channel.mockReturnValue(ch);
});

describe("subscribeTables", () => {
  it("nghe mọi thay đổi của từng bảng, lọc theo Chi nhánh", () => {
    const onChange = vi.fn();
    subscribeTables("orders", "b1", ["t1", "t2"], onChange);
    expect(on).toHaveBeenCalledTimes(2);
    expect(on).toHaveBeenCalledWith(
      "postgres_changes",
      { event: "*", schema: "public", table: "t1", filter: "branch_id=eq.b1" },
      onChange
    );
    expect(on).toHaveBeenCalledWith(
      "postgres_changes",
      { event: "*", schema: "public", table: "t2", filter: "branch_id=eq.b1" },
      onChange
    );
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("tên kênh khác nhau mỗi lần gọi (supabase-js trả lại kênh cũ nếu trùng tên)", () => {
    subscribeTables("stock", "b1", ["t"], vi.fn());
    subscribeTables("stock", "b1", ["t"], vi.fn());
    const [first, second] = channel.mock.calls.map((c) => c[0] as string);
    expect(first).toMatch(/^stock-b1-/);
    expect(second).toMatch(/^stock-b1-/);
    expect(first).not.toBe(second);
  });

  it("hàm trả về gỡ đúng kênh đã mở", () => {
    const stop = subscribeTables("stock", "b1", ["t"], vi.fn());
    expect(removeChannel).not.toHaveBeenCalled();
    stop();
    expect(removeChannel).toHaveBeenCalledTimes(1);
    expect(removeChannel).toHaveBeenCalledWith(channel.mock.results[0].value);
  });
});
