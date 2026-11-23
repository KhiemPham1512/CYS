import { describe, expect, it } from "vitest";
import type { Tables } from "../lib/database.types";
import { diffItemEdits } from "./bulkEdit";
import { toFormValues } from "./itemFormModel";

const item = (over: Partial<Tables<"items">> = {}): Tables<"items"> => ({
  branch_id: "b",
  case_size: null,
  created_at: "",
  group_id: "g",
  id: "i1",
  is_hidden: false,
  skip_count: false,
  sheet: {},
  name: "Món A",
  name_zh: null,
  record_by_percent: false,
  shelf_life: null,
  shelf_life_after_open: null,
  shelf_life_after_open_unit: "day",
  shelf_life_from_receipt_days: null,
  shelf_life_unit: "month",
  sort_order: 1,
  track_mfg_date: false,
  unit: "Hộp",
  unit_zh: null,
  updated_at: "",
  ...over,
});

describe("diffItemEdits", () => {
  it("chỉ trả món có thay đổi, và chỉ các trường đã đổi", () => {
    const a = item();
    const b = item({ id: "i2", name: "Món B" });
    const editedA = { ...toFormValues(a), unit: "Gói", case_size: "12" };
    const r = diffItemEdits([a, b], { i1: editedA, i2: toFormValues(b) });
    expect(r.errors).toEqual({});
    expect(r.updates).toEqual([
      { id: "i1", changes: { unit: "Gói", case_size: 12 } },
    ]);
  });

  it("đổi Thời hạn và theo dõi Ngày sản xuất", () => {
    const a = item();
    const r = diffItemEdits([a], {
      i1: { ...toFormValues(a), shelf_life: "6", track_mfg_date: true },
    });
    expect(r.updates).toEqual([
      { id: "i1", changes: { shelf_life: 6, track_mfg_date: true } },
    ]);
  });

  it("giá trị sai thì báo lỗi theo món và không gửi món đó", () => {
    const a = item();
    const b = item({ id: "i2", name: "Món B" });
    const r = diffItemEdits([a, b], {
      i1: { ...toFormValues(a), case_size: "abc" },
      i2: { ...toFormValues(b), unit: "Gói" },
    });
    expect(r.errors.i1?.case_size).toBeTruthy();
    expect(r.updates).toEqual([{ id: "i2", changes: { unit: "Gói" } }]);
  });

  it("món không có trong bản sửa thì bỏ qua", () => {
    expect(diffItemEdits([item()], {})).toEqual({ updates: [], errors: {} });
  });
});
