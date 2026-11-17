/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCatalogCsv, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("xử lý BOM, ngoặc kép có dấu phẩy và thoát ngoặc kép", () => {
    const csv = '\uFEFF"a,b","c""d"\r\n1,2\r\n\r\n"line1\nline2",3\n';
    expect(parseCsv(csv)).toEqual([
      ["a,b", 'c"d'],
      ["1", "2"],
      ["line1\nline2", "3"],
    ]);
  });
});

describe("parseCatalogCsv", () => {
  it("hỗ trợ thứ tự cột tự do và boolean nhiều dạng", () => {
    const csv = [
      "ten,don_vi,nhom,theo_doi_nsx,ghi_theo_phan_tram",
      "Món 1,Bao,Nhóm A,1,0",
      "Món 2,Bao,Nhóm A,x,",
      "Món 3,Bao,Nhóm A,TRUE,FALSE",
      "Món 4,Bao,Nhóm A,Có,Không",
    ].join("\n");
    const res = parseCatalogCsv(csv);
    expect(res.errors).toEqual([]);
    expect(res.rows.map((r) => r.item.track_mfg_date)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(res.rows.map((r) => r.item.record_by_percent)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it("đọc han_tu_nsx và han_sau_khui theo đơn vị gốc hoặc mặc định", () => {
    const csv = [
      "nhom,ten,don_vi,han_tu_nsx,han_tu_ngay_nhap_ngay,han_sau_khui",
      "Nhóm A,Món 1,Bao,12 tháng,,1 ngày",
      "Nhóm A,Món 2,Bao,15 ngày,7,1 tháng",
      "Nhóm A,Món 3,Bao,3 năm,,",
      "Nhóm A,Món 4,Bao,6,,5",
    ].join("\n");
    const res = parseCatalogCsv(csv);
    expect(res.errors).toEqual([]);
    expect(
      res.rows.map((r) => ({
        shelf_life: r.item.shelf_life,
        shelf_life_unit: r.item.shelf_life_unit,
        shelf_life_from_receipt_days: r.item.shelf_life_from_receipt_days,
        shelf_life_after_open: r.item.shelf_life_after_open,
        shelf_life_after_open_unit: r.item.shelf_life_after_open_unit,
      }))
    ).toEqual([
      {
        shelf_life: 12,
        shelf_life_unit: "month",
        shelf_life_from_receipt_days: null,
        shelf_life_after_open: 1,
        shelf_life_after_open_unit: "day",
      },
      {
        shelf_life: 15,
        shelf_life_unit: "day",
        shelf_life_from_receipt_days: 7,
        shelf_life_after_open: 1,
        shelf_life_after_open_unit: "month",
      },
      {
        shelf_life: 36,
        shelf_life_unit: "month",
        shelf_life_from_receipt_days: null,
        shelf_life_after_open: null,
        shelf_life_after_open_unit: "day",
      },
      {
        shelf_life: 6,
        shelf_life_unit: "month",
        shelf_life_from_receipt_days: null,
        shelf_life_after_open: 5,
        shelf_life_after_open_unit: "day",
      },
    ]);
  });

  it("báo lỗi đúng số dòng khi số hoặc thời hạn sai và bỏ dòng đó", () => {
    const csv = [
      "nhom,ten,don_vi,quy_cach_thung,han_tu_nsx,han_sau_khui",
      "Nhóm A,Món 1,Bao,10,12 tháng,3 ngày",
      "Nhóm A,Món 2,Bao,0,abc,2 tuần",
      "Nhóm A,Món 3,Bao,20,6 tháng,1 ngày",
    ].join("\n");
    const res = parseCatalogCsv(csv);
    expect(res.rows.map((r) => r.item.name)).toEqual(["Món 1", "Món 3"]);
    expect(res.errors).toEqual([
      "Dòng 3: quy_cach_thung phải là số nguyên lớn hơn 0",
      "Dòng 3: han_tu_nsx không hợp lệ",
      "Dòng 3: han_sau_khui không hợp lệ",
    ]);
  });

  it("báo lỗi khi thiếu cột bắt buộc", () => {
    const res = parseCatalogCsv("nhom,ten\nA,B");
    expect(res.rows).toEqual([]);
    expect(res.errors[0]).toContain("don_vi");
  });

  it("báo lỗi khi trùng tên món trong file", () => {
    const csv = [
      "nhom,ten,don_vi",
      "Nhóm A,Hồng trà,Bao",
      "Nhóm B,Hồng trà,Bao",
    ].join("\n");
    const res = parseCatalogCsv(csv);
    expect(res.rows).toHaveLength(1);
    expect(res.errors[0]).toContain("Dòng 3:");
  });

  it("đọc file mẫu supabase/sample/danh-muc.mau.csv không lỗi, >= 10 món, 4 Nhóm", () => {
    const samplePath = resolve(
      process.cwd(),
      "supabase/sample/danh-muc.mau.csv"
    );
    const content = readFileSync(samplePath, "utf8");
    const res = parseCatalogCsv(content);
    expect(res.errors).toEqual([]);
    expect(res.rows.length).toBeGreaterThanOrEqual(10);
    const groups = new Set(res.rows.map((r) => r.group.name));
    expect(groups.size).toBe(4);
  });
});

describe("chạy được bằng Node (script import-catalog)", () => {
  it("import csv.ts trực tiếp bằng Node không lỗi (import tương đối phải có đuôi .ts)", async () => {
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "const m = await import('./src/catalog/csv.ts'); console.log(typeof m.parseCatalogCsv);",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    expect(out.trim()).toBe("function");
  });
});
