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
      return whole > 0 ? `${whole} ${unitLower} ${pct}%` : `${pct}%`;
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

  if (opts.caseSize !== null && opts.caseSize > 0 && q >= opts.caseSize) {
    const cases = Math.floor((q + 1e-9) / opts.caseSize);
    const rest = Math.max(0, round4(q - cases * opts.caseSize));
    if (rest === 0) {
      return `${cases} thùng`;
    }
    return `${cases} thùng ${formatRest(rest, unitLower, opts.byPercent)}`;
  }

  return formatRest(q, unitLower, opts.byPercent);
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
