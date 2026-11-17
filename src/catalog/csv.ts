import type { TablesInsert } from "../lib/database.types";
import { parseDuration } from "./duration.ts";

export type CatalogRow = {
  group: {
    name: string;
    name_zh: string | null;
    sort_order: number;
  };
  item: Omit<TablesInsert<"items">, "branch_id" | "group_id">;
};

type ParsedLine = {
  lineNumber: number;
  cells: string[];
};

function parseCsvLines(text: string): ParsedLine[] {
  const input = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const rows: ParsedLine[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line++;
        else if (ch === "\r") {
          line++;
          if (input[i + 1] === "\n") i++;
        }
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      if (field.length === 0) {
        inQuotes = true;
      } else {
        field += ch;
      }
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && input[i + 1] === "\n") {
        i++;
      }
      row.push(field);
      field = "";
      if (!(row.length === 1 && row[0].trim() === "")) {
        rows.push({ lineNumber: rowStartLine, cells: row });
      }
      row = [];
      line++;
      rowStartLine = line;
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (!(row.length === 1 && row[0].trim() === "")) {
      rows.push({ lineNumber: rowStartLine, cells: row });
    }
  }

  return rows;
}

export function parseCsv(text: string): string[][] {
  return parseCsvLines(text).map((r) => r.cells);
}

function parseBooleanCell(raw: string): boolean | null {
  const s = raw.trim().toLowerCase();
  if (s === "1" || s === "x" || s === "true" || s === "có") return true;
  if (s === "" || s === "0" || s === "false" || s === "không") return false;
  return null;
}

function parsePositiveIntCell(
  raw: string
): { ok: true; value: number | null } | { ok: false } {
  const s = raw.trim();
  if (!s) return { ok: true, value: null };
  if (!/^\d+$/.test(s)) return { ok: false };
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n <= 0) return { ok: false };
  return { ok: true, value: n };
}

function parseSortOrderCell(
  raw: string
): { ok: true; value: number } | { ok: false } {
  const s = raw.trim();
  if (!s) return { ok: true, value: 0 };
  if (!/^-?\d+$/.test(s)) return { ok: false };
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return { ok: false };
  return { ok: true, value: n };
}

export function parseCatalogCsv(text: string): {
  rows: CatalogRow[];
  errors: string[];
} {
  const parsed = parseCsvLines(text);
  if (parsed.length === 0) {
    return { rows: [], errors: ["File CSV rỗng"] };
  }

  const header = parsed[0].cells.map((h) => h.trim());
  const colIndex = new Map<string, number>();
  header.forEach((name, idx) => {
    if (name && !colIndex.has(name)) {
      colIndex.set(name, idx);
    }
  });

  const requiredCols = ["nhom", "ten", "don_vi"];
  const missingCols = requiredCols.filter((c) => !colIndex.has(c));
  if (missingCols.length > 0) {
    return {
      rows: [],
      errors: [`Thiếu cột bắt buộc: ${missingCols.join(", ")}`],
    };
  }

  const cell = (cells: string[], col: string): string => {
    const idx = colIndex.get(col);
    return idx === undefined ? "" : (cells[idx] ?? "").trim();
  };

  const rows: CatalogRow[] = [];
  const errors: string[] = [];
  const seenNames = new Set<string>();

  for (let i = 1; i < parsed.length; i++) {
    const { lineNumber, cells } = parsed[i];
    const rowErrors: string[] = [];

    const nhom = cell(cells, "nhom");
    const nhomZh = cell(cells, "nhom_zh") || null;
    const ten = cell(cells, "ten");
    const tenZh = cell(cells, "ten_zh") || null;
    const donVi = cell(cells, "don_vi");
    const donViZh = cell(cells, "don_vi_zh") || null;

    if (!nhom) rowErrors.push(`Dòng ${lineNumber}: nhom bắt buộc`);
    if (!ten) rowErrors.push(`Dòng ${lineNumber}: ten bắt buộc`);
    if (!donVi) rowErrors.push(`Dòng ${lineNumber}: don_vi bắt buộc`);

    const sortOrder = parseSortOrderCell(cell(cells, "thu_tu_nhom"));
    if (!sortOrder.ok) {
      rowErrors.push(`Dòng ${lineNumber}: thu_tu_nhom phải là số nguyên`);
    }

    const caseSize = parsePositiveIntCell(cell(cells, "quy_cach_thung"));
    if (!caseSize.ok) {
      rowErrors.push(
        `Dòng ${lineNumber}: quy_cach_thung phải là số nguyên lớn hơn 0`
      );
    }

    const trackMfgDate = parseBooleanCell(cell(cells, "theo_doi_nsx"));
    if (trackMfgDate === null) {
      rowErrors.push(`Dòng ${lineNumber}: theo_doi_nsx không hợp lệ`);
    }

    const shelfLife = parseDuration(cell(cells, "han_tu_nsx"), "month");
    if (!shelfLife.ok) {
      rowErrors.push(`Dòng ${lineNumber}: han_tu_nsx không hợp lệ`);
    }

    const shelfLifeFromReceiptDays = parsePositiveIntCell(
      cell(cells, "han_tu_ngay_nhap_ngay")
    );
    if (!shelfLifeFromReceiptDays.ok) {
      rowErrors.push(
        `Dòng ${lineNumber}: han_tu_ngay_nhap_ngay phải là số nguyên lớn hơn 0`
      );
    }

    const shelfLifeAfterOpen = parseDuration(
      cell(cells, "han_sau_khui"),
      "day"
    );
    if (!shelfLifeAfterOpen.ok) {
      rowErrors.push(`Dòng ${lineNumber}: han_sau_khui không hợp lệ`);
    }

    const recordByPercent = parseBooleanCell(cell(cells, "ghi_theo_phan_tram"));
    if (recordByPercent === null) {
      rowErrors.push(`Dòng ${lineNumber}: ghi_theo_phan_tram không hợp lệ`);
    }

    if (ten && seenNames.has(ten)) {
      rowErrors.push(`Dòng ${lineNumber}: trùng tên món "${ten}"`);
    }

    if (
      rowErrors.length > 0 ||
      !sortOrder.ok ||
      !caseSize.ok ||
      trackMfgDate === null ||
      !shelfLife.ok ||
      !shelfLifeFromReceiptDays.ok ||
      !shelfLifeAfterOpen.ok ||
      recordByPercent === null
    ) {
      errors.push(...rowErrors);
      continue;
    }

    seenNames.add(ten);
    rows.push({
      group: {
        name: nhom,
        name_zh: nhomZh,
        sort_order: sortOrder.value,
      },
      item: {
        name: ten,
        name_zh: tenZh,
        unit: donVi,
        unit_zh: donViZh,
        case_size: caseSize.value,
        track_mfg_date: trackMfgDate,
        shelf_life: shelfLife.value?.amount ?? null,
        shelf_life_unit: shelfLife.value?.unit ?? "month",
        shelf_life_from_receipt_days: shelfLifeFromReceiptDays.value,
        shelf_life_after_open: shelfLifeAfterOpen.value?.amount ?? null,
        shelf_life_after_open_unit: shelfLifeAfterOpen.value?.unit ?? "day",
        record_by_percent: recordByPercent,
      },
    });
  }

  return { rows, errors };
}
