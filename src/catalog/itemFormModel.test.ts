import { describe, expect, it } from "vitest";
import { emptyForm, parseItemForm, toFormValues } from "./itemFormModel";

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
      record_by_percent: false,
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
        record_by_percent: false,
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
        record_by_percent: false,
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
});

describe("toFormValues", () => {
  it("chuyển item DB về giá trị form giữ nguyên đơn vị", () => {
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
        shelf_life: 15,
        shelf_life_unit: "day",
        shelf_life_from_receipt_days: 14,
        shelf_life_after_open: 3,
        shelf_life_after_open_unit: "day",
        record_by_percent: true,
        is_hidden: false,
        created_at: "",
        updated_at: "",
        sort_order: 1000,
      })
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
      record_by_percent: true,
    });
  });
});
