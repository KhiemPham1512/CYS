import { beforeEach, describe, expect, it, vi } from "vitest";

// Ranh giới ngoài: chỉ giả lập Supabase (hàm server và bảng), không giả lập hàm nội bộ.
const invoke = vi.fn();
const upsert = vi.fn();
const select = vi.fn();
vi.mock("../lib/supabase", () => ({
  supabase: {
    functions: { invoke },
    from: () => ({ upsert, select }),
  },
}));

const { readOrderImages, loadAliases, saveAlias } =
  await import("./readOrderApi");

beforeEach(() => {
  invoke.mockReset();
  upsert.mockReset();
  select.mockReset();
});

const images = [{ mime: "image/png", data: "AAAA" }];

describe("readOrderImages", () => {
  it("thành công trả các dòng thô", async () => {
    const lines = [
      { name: "A", qty: 1, unit: "Lon", pack: null, orderCode: null },
    ];
    invoke.mockResolvedValue({ data: { lines }, error: null });
    expect(await readOrderImages("b1", images)).toEqual({ lines, error: null });
    expect(invoke).toHaveBeenCalledWith("read-supplier-order", {
      body: { branch_id: "b1", images },
    });
  });

  it("hàm server báo hết hạn mức thì chuyển nguyên lời của server", async () => {
    const context = new Response(
      JSON.stringify({ error: "Hết hạn mức đọc ảnh hôm nay." }),
      { status: 429 }
    );
    invoke.mockResolvedValue({ data: null, error: { context } });
    expect(await readOrderImages("b1", images)).toEqual({
      lines: null,
      error: "Hết hạn mức đọc ảnh hôm nay.",
    });
  });

  it("mất mạng (không có lời server) thì nhắc kiểm tra mạng", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("fetch failed") });
    const r = await readOrderImages("b1", images);
    expect(r.lines).toBeNull();
    expect(r.error).toMatch(/mạng/);
  });
});

describe("alias tên nhà cung cấp", () => {
  it("loadAliases trả bản đồ khóa chuẩn hóa → món", async () => {
    select.mockReturnValue({
      eq: () =>
        Promise.resolve({
          data: [{ alias_key: "hang x", item_id: "i1" }],
          error: null,
        }),
    });
    expect(await loadAliases("b1")).toEqual({ "hang x": "i1" });
  });

  it("saveAlias lưu theo khóa đã chuẩn hóa (bỏ tên Trung, khối lượng), ghi đè khi nhớ lại", async () => {
    upsert.mockResolvedValue({ error: null });
    expect(await saveAlias("b1", "Hàng X 1kg - 某", "i1")).toEqual({
      error: null,
    });
    expect(upsert).toHaveBeenCalledWith(
      { branch_id: "b1", alias_key: "hang x", item_id: "i1" },
      { onConflict: "branch_id,alias_key" }
    );
  });
});
