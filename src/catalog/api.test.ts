import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock("../lib/supabase", () => ({
  supabase: { from },
}));

const { loadCatalogReadOnly } = await import("./api");

beforeEach(() => {
  from.mockClear();
  select.mockClear();
  eq.mockClear();
  maybeSingle.mockReset();
});

describe("loadCatalogReadOnly", () => {
  it("catalog_source có giá trị thì trả true và truy vấn bảng branches theo id", async () => {
    maybeSingle.mockResolvedValue({
      data: { catalog_source: "b-main" },
      error: null,
    });
    expect(await loadCatalogReadOnly("b-sub")).toBe(true);
    expect(from).toHaveBeenCalledWith("branches");
    expect(select).toHaveBeenCalledWith("catalog_source");
    expect(eq).toHaveBeenCalledWith("id", "b-sub");
  });

  it("catalog_source là null thì trả false", async () => {
    maybeSingle.mockResolvedValue({
      data: { catalog_source: null },
      error: null,
    });
    expect(await loadCatalogReadOnly("b-main")).toBe(false);
  });

  it("không có dòng (data là null) thì trả false", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    expect(await loadCatalogReadOnly("b-missing")).toBe(false);
  });

  it("truy vấn lỗi thì ném lỗi", async () => {
    const err = { code: "500", message: "db error" };
    maybeSingle.mockResolvedValue({
      data: null,
      error: err,
    });
    await expect(loadCatalogReadOnly("b-sub")).rejects.toEqual(err);
  });
});
