import { describe, expect, it } from "vitest";
import {
  emptyForm,
  inUseSwitchValue,
  parseItemForm,
  toFormValues,
} from "./itemFormModel";

describe("parseItemForm", () => {
  it("hợp lệ đầy đủ và trim chuỗi", () => {
    const res = parseItemForm({
      name: "  Trân châu đen  ",
      name_zh: "  黑珍珠 ",
      group_id: " g1 ",
      unit: " Bao ",
      unit_zh: " 包 ",
      case_size: " 20 ",
      shelf_life: "12",
      shelf_life_unit: "month",
      shelf_life_from_receipt_days: "30",
      shelf_life_after_open: "1",
      shelf_life_after_open_unit: "day",
      track_mfg_date: true,
      track_in_use: true,
      record_by_percent: false,
      skip_count: true,
    });
    expect(res).toEqual({
      ok: true,
      value: {
        name: "Trân châu đen",
        name_zh: "黑珍珠",
        group_id: "g1",
        unit: "Bao",
        unit_zh: "包",
        case_size: 20,
        shelf_life: 12,
        shelf_life_unit: "month",
        shelf_life_from_receipt_days: 30,
        shelf_life_after_open: 1,
        shelf_life_after_open_unit: "day",
        track_mfg_date: true,
        track_in_use: true,
        record_by_percent: false,
        skip_count: true,
      },
    });
  });

  it("rỗng chuyển thành null, giữ đơn vị mặc định và không tự đổi track_mfg_date", () => {
    const res = parseItemForm({
      ...emptyForm("g1"),
      name: "Hồng trà",
      unit: "Bao",
      shelf_life: "24",
      track_mfg_date: false,
    });
    expect(res).toEqual({
      ok: true,
      value: {
        name: "Hồng trà",
        name_zh: null,
        group_id: "g1",
        unit: "Bao",
        unit_zh: null,
        case_size: null,
        shelf_life: 24,
        shelf_life_unit: "month",
        shelf_life_from_receipt_days: null,
        shelf_life_after_open: null,
        shelf_life_after_open_unit: "day",
        track_mfg_date: false,
        track_in_use: null,
        record_by_percent: false,
        skip_count: false,
      },
    });
  });

  it("báo lỗi khi thiếu tên, đơn vị, nhóm", () => {
    const res = parseItemForm(emptyForm());
    expect(res).toEqual({
      ok: false,
      errors: {
        name: "Bắt buộc",
        group_id: "Bắt buộc",
        unit: "Bắt buộc",
      },
    });
  });

  it("báo lỗi khi số không phải số nguyên dương", () => {
    for (const bad of ["0", "-1", "1.5", "abc"]) {
      const res = parseItemForm({
        ...emptyForm("g1"),
        name: "Món A",
        unit: "Bao",
        case_size: bad,
        shelf_life: bad,
        shelf_life_from_receipt_days: bad,
        shelf_life_after_open: bad,
      });
      expect(res).toEqual({
        ok: false,
        errors: {
          case_size: "Số nguyên lớn hơn 0",
          shelf_life: "Số nguyên lớn hơn 0",
          shelf_life_from_receipt_days: "Số nguyên lớn hơn 0",
          shelf_life_after_open: "Số nguyên lớn hơn 0",
        },
      });
    }
  });

  it("đặt lại track_in_use về null khi xóa trắng hạn sau khui", () => {
    const res = parseItemForm({
      ...emptyForm("g1"),
      name: "Kem phô mai",
      unit: "Hộp",
      shelf_life_after_open: "   ",
      track_in_use: true,
    });
    expect(res.ok && res.value.shelf_life_after_open).toBe(null);
    expect(res.ok && res.value.track_in_use).toBe(null);
  });
});

describe("toFormValues", () => {
  it("chuyển item DB về giá trị form giữ nguyên đơn vị và skip_count", () => {
    expect(emptyForm().skip_count).toBe(false);
    expect(emptyForm().track_in_use).toBe(null);
    expect(
      toFormValues({
        sheet: {},
        id: "1",
        branch_id: "b1",
        group_id: "g1",
        name: "Sữa tươi",
        name_zh: null,
        unit: "Bình",
        unit_zh: "瓶",
        case_size: null,
        track_mfg_date: false,
        track_in_use: null,
        shelf_life: 15,
        shelf_life_unit: "day",
        shelf_life_from_receipt_days: 14,
        shelf_life_after_open: 3,
        shelf_life_after_open_unit: "day",
        record_by_percent: true,
        skip_count: true,
        is_hidden: false,
        created_at: "",
        updated_at: "",
        sort_order: 1000,
      } as Parameters<typeof toFormValues>[0])
    ).toEqual({
      name: "Sữa tươi",
      name_zh: "",
      group_id: "g1",
      unit: "Bình",
      unit_zh: "瓶",
      case_size: "",
      shelf_life: "15",
      shelf_life_unit: "day",
      shelf_life_from_receipt_days: "14",
      shelf_life_after_open: "3",
      shelf_life_after_open_unit: "day",
      track_mfg_date: false,
      track_in_use: null,
      record_by_percent: true,
      skip_count: true,
    });
  });

  it("round-trip track_in_use (null/true/false) qua toFormValues và parseItemForm", () => {
    for (const val of [null, true, false] as const) {
      const form = toFormValues({
        sheet: {},
        id: "1",
        branch_id: "b1",
        group_id: "g1",
        name: "Siro đào",
        name_zh: null,
        unit: "Chai",
        unit_zh: null,
        case_size: null,
        track_mfg_date: false,
        track_in_use: val,
        shelf_life: null,
        shelf_life_unit: "month",
        shelf_life_from_receipt_days: null,
        shelf_life_after_open: 10,
        shelf_life_after_open_unit: "day",
        record_by_percent: false,
        skip_count: false,
        is_hidden: false,
        created_at: "",
        updated_at: "",
        sort_order: 1,
      });
      expect(form.track_in_use).toBe(val);
      const parsed = parseItemForm(form);
      expect(parsed.ok && parsed.value.track_in_use).toBe(val);
    }
  });
});

describe("inUseSwitchValue", () => {
  it("tự động theo hạn sau khui trên form khi track_in_use là null", () => {
    const base = emptyForm("g1");
    expect(
      inUseSwitchValue({
        ...base,
        shelf_life_after_open: "8",
        shelf_life_after_open_unit: "day",
      })
    ).toBe(true);
    expect(
      inUseSwitchValue({
        ...base,
        shelf_life_after_open: "7",
        shelf_life_after_open_unit: "day",
      })
    ).toBe(false);
    expect(
      inUseSwitchValue({
        ...base,
        shelf_life_after_open: "1",
        shelf_life_after_open_unit: "month",
      })
    ).toBe(true);
    expect(
      inUseSwitchValue({
        ...base,
        shelf_life_after_open: "",
        shelf_life_after_open_unit: "month",
      })
    ).toBe(false);
    expect(
      inUseSwitchValue({
        ...base,
        shelf_life_after_open: "abc",
        shelf_life_after_open_unit: "month",
      })
    ).toBe(false);
  });

  it("ghi đè tường minh khi track_in_use là true hoặc false", () => {
    const base = emptyForm("g1");
    expect(
      inUseSwitchValue({
        ...base,
        shelf_life_after_open: "3",
        shelf_life_after_open_unit: "day",
        track_in_use: true,
      })
    ).toBe(true);
    expect(
      inUseSwitchValue({
        ...base,
        shelf_life_after_open: "30",
        shelf_life_after_open_unit: "day",
        track_in_use: false,
      })
    ).toBe(false);
  });
});
