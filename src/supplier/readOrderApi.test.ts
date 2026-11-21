import { beforeEach, describe, expect, it, vi } from "vitest";

// Ranh giới ngoài: chỉ giả lập Supabase (hàm server và bảng), không giả lập hàm nội bộ.
const invoke = vi.fn();
const insert = vi.fn();
const update = vi.fn();
const select = vi.fn();
vi.mock("../lib/supabase", () => ({
  supabase: {
    functions: { invoke },
    from: () => ({ insert, update, select }),
  },
}));

const { readOrderImages, loadAliases, saveAlias } =
  await import("./readOrderApi");

beforeEach(() => {
  invoke.mockReset();
  insert.mockReset();
  update.mockReset();
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

  it("saveAlias thêm mới theo khóa đã chuẩn hóa (bỏ tên Trung, khối lượng)", async () => {
    insert.mockResolvedValue({ error: null });
    expect(await saveAlias("b1", "Hàng X 1kg - 某", "i1")).toEqual({
      error: null,
    });
    expect(insert).toHaveBeenCalledWith({
      branch_id: "b1",
      alias_key: "hang x",
      item_id: "i1",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("tên đã được nhớ (trùng khóa) thì đổi sang món mới, chỉ sửa cột item_id", async () => {
    insert.mockResolvedValue({ error: { code: "23505", message: "dup" } });
    const eq2 = vi.fn().mockResolvedValue({ error: null });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    update.mockReturnValue({ eq: eq1 });
    expect(await saveAlias("b1", "Hàng X", "i2")).toEqual({ error: null });
    expect(update).toHaveBeenCalledWith({ item_id: "i2" });
    expect(eq1).toHaveBeenCalledWith("branch_id", "b1");
    expect(eq2).toHaveBeenCalledWith("alias_key", "hang x");
  });

  it("lỗi từ máy chủ không bị nói là lỗi mạng", async () => {
    insert.mockResolvedValue({ error: { code: "42501", message: "denied" } });
    const r = await saveAlias("b1", "Hàng X", "i1");
    expect(r.error).not.toMatch(/mạng/);
    expect(r.error).toBeTruthy();
  });

  it("mất mạng (lỗi không có mã) thì nhắc kiểm tra mạng", async () => {
    insert.mockResolvedValue({ error: { message: "Network request failed" } });
    expect((await saveAlias("b1", "Hàng X", "i1")).error).toMatch(/mạng/);
  });
});
