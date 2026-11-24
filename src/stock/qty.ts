// Món có thùng nhưng chưa biết 1 thùng bao nhiêu (ống hút, túi): khai quy cách thùng QUY ƯỚC bằng số này, đủ lớn để số bịch
// không bao giờ chạm tới, nên "1T+28" luôn là 1 thùng và 28 bịch đếm riêng (không phải số thật bịch/thùng).
// Khi biết quy cách thật thì sửa case_size trong Danh mục và đổi lại số tồn cũ.
export const OPEN_CASE_SIZE = 1000;

export type ParseQtyOptions = {
  caseSize: number | null;
  byPercent: boolean;
};

export type ParseQtyResult =
  { ok: true; value: number } | { ok: false; error: string };

export type FormatQtyOptions = {
  caseSize: number | null;
  unit: string;
  byPercent: boolean;
  splitCases?: boolean;
};

export function round4(n: number): number {
  const rounded = Math.round(n * 10000) / 10000;
  return rounded === 0 ? 0 : rounded;
}

function formatDecimal(n: number): string {
  return String(round4(n)).replace(".", ",");
}

export function parseQty(input: string, opts: ParseQtyOptions): ParseQtyResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "Chưa nhập" };
  }

  const parts = trimmed.split("+");
  let total = 0;

  for (const part of parts) {
    const term = part.trim();
    if (!term) {
      return { ok: false, error: "Số lượng không hợp lệ" };
    }

    // Viết như tờ giấy "N(k:P%)": N hộp, trong đó k hộp còn P%, còn lại nguyên; bỏ "k:" thì k = 1
    // (1(90%) = 0,9; 2(1:90%) = 2(90%) = 1,9).
    const paren =
      /^(\d+)\s*\(\s*(?:(\d+)\s*:\s*)?(\d+(?:[.,]\d+)?)\s*%\s*\)$/.exec(term);
    if (paren) {
      if (!opts.byPercent) {
        return { ok: false, error: "Chỉ món Ghi theo % mới gõ được %" };
      }
      const boxes = Number(paren[1]);
      const partial = paren[2] === undefined ? 1 : Number(paren[2]);
      const left = Number(paren[3].replace(",", ".")) / 100;
      if (partial < 1 || partial > boxes || left > 1) {
        return { ok: false, error: "Số lượng không hợp lệ" };
      }
      total += boxes - partial + partial * left;
      continue;
    }

    const match = /^(\d+(?:[.,]\d+)?)\s*([tT%])?$/.exec(term);
    if (!match) {
      return { ok: false, error: "Số lượng không hợp lệ" };
    }

    const num = Number(match[1].replace(",", "."));
    if (!Number.isFinite(num) || num < 0) {
      return { ok: false, error: "Số lượng không hợp lệ" };
    }

    const suffix = match[2];
    if (suffix === "T" || suffix === "t") {
      if (opts.caseSize === null || opts.caseSize <= 0) {
        return { ok: false, error: "Món này chưa có Quy cách thùng" };
      }
      total += num * opts.caseSize;
    } else if (suffix === "%") {
      if (!opts.byPercent) {
        return { ok: false, error: "Chỉ món Ghi theo % mới gõ được %" };
      }
      total += num / 100;
    } else {
      total += num;
    }
  }

  return { ok: true, value: round4(total) };
}

function formatRest(
  rest: number,
  unitLower: string,
  byPercent: boolean
): string {
  const r = round4(rest);
  if (r === 0) {
    return `0 ${unitLower}`;
  }

  if (byPercent) {
    const whole = Math.floor(r);
    const frac = round4(r - whole);
    if (frac > 0) {
      const pct = formatDecimal(round4(frac * 100));
      return whole > 0 ? `${whole + 1}(1:${pct}%)` : `1(${pct}%)`;
    }
    return `${whole} ${unitLower}`;
  }

  return `${formatDecimal(r)} ${unitLower}`;
}

export function formatQty(qty: number, opts: FormatQtyOptions): string {
  const q = round4(qty);
  const unitLower = opts.unit.trim().toLowerCase();

  if (q <= 0) {
    return `0 ${unitLower}`;
  }

  // Quy cách 1 hoặc đơn vị chính là "thùng": tách "N thùng" + phần dư sẽ lặp chữ (1 thùng 0,5 thùng), in số thẳng.
  // Thùng chưa rõ quy cách luôn tách thùng và lẻ, kể cả ở màn kho tắt gộp thùng (lẻ không bao giờ tự thành thùng).
  const splitCases =
    ((opts.splitCases ?? true) || opts.caseSize === OPEN_CASE_SIZE) &&
    opts.caseSize !== null &&
    opts.caseSize > 1 &&
    unitLower !== "thùng";
  if (splitCases && opts.caseSize !== null && q >= opts.caseSize) {
    const cases = Math.floor((q + 1e-9) / opts.caseSize);
    const rest = Math.max(0, round4(q - cases * opts.caseSize));
    if (rest === 0) {
      return `${cases} thùng`;
    }
    return `${cases} thùng ${formatRest(rest, unitLower, opts.byPercent)}`;
  }

  return formatRest(q, unitLower, opts.byPercent);
}

// Định dạng số lượng theo quy cách của món; món chưa tải (undefined) thì in số trần.
export function formatItemQty(
  item:
    | { case_size: number | null; unit: string; record_by_percent: boolean }
    | undefined,
  qty: number
): string {
  return formatQty(qty, {
    caseSize: item?.case_size ?? null,
    unit: item?.unit ?? "",
    byPercent: item?.record_by_percent ?? false,
  });
}

// Tồn kho/Kiểm kho/Ghi dùng: giữ nguyên cách viết thùng/lẻ của người dùng nếu tổng vẫn khớp, ngược lại hiện đơn vị lẻ.
export function formatStockQty(
  item:
    | { case_size: number | null; unit: string; record_by_percent: boolean }
    | undefined,
  qty: number,
  qtyText?: string | null
): string {
  if (item && qtyText && qtyText.trim()) {
    const parsed = parseQty(qtyText, {
      caseSize: item.case_size,
      byPercent: item.record_by_percent,
    });
    if (parsed.ok && round4(parsed.value) === round4(qty)) {
      let cases = 0;
      for (const part of qtyText.split("+")) {
        const m = /^(\d+(?:[.,]\d+)?)\s*[tT]$/.exec(part.trim());
        if (m) {
          cases = round4(cases + Number(m[1].replace(",", ".")));
        }
      }
      const rest = round4(qty - cases * (item.case_size ?? 0));
      const unitLower = item.unit.trim().toLowerCase();
      const head = cases > 0 ? `${cases} thùng` : "";
      const tail =
        rest > 0 || cases === 0
          ? formatRest(rest, unitLower, item.record_by_percent)
          : "";
      return [head, tail].filter(Boolean).join(" ");
    }
  }

  return formatQty(qty, {
    caseSize: item?.case_size ?? null,
    unit: item?.unit ?? "",
    byPercent: item?.record_by_percent ?? false,
    splitCases: false,
  });
}

// Ô Điều chỉnh tồn kho: số không dấu = số mới; "+x" / "-x" = cộng/trừ vào số đang có.
export function parseAdjust(
  input: string,
  current: number,
  opts: ParseQtyOptions
): ParseQtyResult {
  const trimmed = input.trim();
  const sign = trimmed[0] === "+" ? 1 : /^[-−]/.test(trimmed) ? -1 : 0;
  const parsed = parseQty(sign ? trimmed.slice(1) : trimmed, opts);
  if (!parsed.ok || !sign) return parsed;
  const value = round4(current + sign * parsed.value);
  return value < 0
    ? { ok: false, error: "Không đủ để trừ" }
    : { ok: true, value };
}

// Số viết kiểu tờ giấy / ô nhập: "1T+3", "2T", "7", "1(90%)", "3(1:95%)". Khứ hồi với parseQty.
export function formatSheetQty(qty: number, opts: ParseQtyOptions): string {
  const q = round4(qty);
  if (q <= 0) return "0";

  const formatRest = (rest: number): string => {
    const r = round4(rest);
    if (opts.byPercent) {
      const whole = Math.floor(r);
      const frac = round4(r - whole);
      if (frac > 0) {
        const pct = formatDecimal(round4(frac * 100));
        // shortcut: chỉ biết tổng nên coi phần lẻ là đúng 1 hộp lẻ (k = 1); nhiều hộp lẻ khác mức thì gõ tay N(k:P%).
        return whole > 0 ? `${whole + 1}(1:${pct}%)` : `1(${pct}%)`;
      }
      return String(whole);
    }
    return formatDecimal(r);
  };

  if (opts.caseSize !== null && opts.caseSize > 0 && q >= opts.caseSize) {
    const cases = Math.floor((q + 1e-9) / opts.caseSize);
    const rest = Math.max(0, round4(q - cases * opts.caseSize));
    return rest === 0 ? `${cases}T` : `${cases}T+${formatRest(rest)}`;
  }

  return formatRest(q);
}
