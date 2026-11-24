import { describe, expect, it } from "vitest";
import type { SheetModel } from "./exportSheet";
import { drawSheet, type Ctx } from "./sheetCanvas";
import { nameLines, sheetGeometry } from "./sheetGeometry";

// Ngữ cảnh giả: ghi lại các lần vẽ chữ và nét để kiểm vị trí.
function fakeCtx() {
  const texts: { s: string; x: number; y: number }[] = [];
  const hlines: { y: number; x1: number; x2: number }[] = [];
  let pts: number[] = [];
  const ctx: Ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "left",
    textBaseline: "middle",
    fillRect() {},
    fillText(s, x, y) {
      texts.push({ s, x, y });
    },
    measureText: (s) => ({ width: s.length * 8 }),
    beginPath() {
      pts = [];
    },
    moveTo(x, y) {
      pts = [x, y];
    },
    lineTo(x, y) {
      if (pts[1] === y) hlines.push({ y, x1: pts[0], x2: x });
    },
    stroke() {},
  };
  return { ctx, texts, hlines };
}

const model = (n: number): SheetModel => ({
  title: "TỒN KHO TIỆM MẪU",
  titleZh: "（庫存表）",
  qtyLabel: "SỐ LƯỢNG",
  rows: Array.from({ length: n }, (_, i) => ({
    stt: i + 1,
    name: `Món mẫu ${i + 1}`,
    zh: "（甲乙）",
    note: i === 0 ? "1 thùng / 20 cây" : "",
    unit: "Bao",
    unitZh: "包",
    qty: i % 2 ? "2() 2(20)" : `q${i + 1}`,
  })),
  categories: [
    { label: "NHÓM A", labelZh: "甲", span: Math.ceil(n / 2) },
    { label: "NHÓM B", labelZh: "乙", span: Math.floor(n / 2) },
  ],
});

describe("drawSheet: mọi ô cùng hàng thẳng hàng với nhau", () => {
  for (const n of [5, 12, 20]) {
    it(`${n} hàng: STT, tên, đơn vị, số lượng của một hàng cùng tâm dọc và nằm trong hàng`, () => {
      const m = model(n);
      const W = 1240;
      const { ctx, texts } = fakeCtx();
      drawSheet(ctx, W, m, "24/11", "");
      const g = sheetGeometry(m, W);
      const rowsY = m.rows.map((r) => {
        const stt = texts.find((t) => t.s === String(r.stt) && t.x < 200)!;
        // Chỉ xét chữ nằm trong dải của hàng này (tâm STT ± nửa hàng).
        const band = texts.filter((t) => Math.abs(t.y - stt.y) < g.rowH / 2);
        const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
        const nameYs = band
          .filter(
            (t) =>
              t.s.startsWith(`Món mẫu ${r.stt}`) || t.s.startsWith("（甲乙）")
          )
          .map((t) => t.y);
        const unitYs = band
          .filter((t) => t.s === "Bao" || t.s === "包")
          .map((t) => t.y);
        const qty = band.find((t) => t.s === r.qty)!;
        expect(nameYs.length).toBeGreaterThan(0);
        expect(unitYs).toHaveLength(2);
        expect(Math.abs(mean(nameYs) - stt.y)).toBeLessThan(0.5);
        expect(Math.abs(mean(unitYs) - stt.y)).toBeLessThan(0.5);
        expect(Math.abs(qty.y - stt.y)).toBeLessThan(0.5);
        return stt.y;
      });
      // Hàng liền nhau cách đúng rowH (không trôi dần).
      for (let i = 1; i < rowsY.length; i++)
        expect(rowsY[i] - rowsY[i - 1]).toBeCloseTo(g.rowH, 3);
    });
  }

  it("kẻ ngang cách đều rowH và kéo qua cột tên, đơn vị, số lượng", () => {
    const m = model(12);
    const { ctx, hlines } = fakeCtx();
    drawSheet(ctx, 1240, m, "24/11", "");
    const g = sheetGeometry(m, 1240);
    const ys = hlines
      .filter((l) => l.x2 - l.x1 > g.tableW * 0.5)
      .map((l) => l.y)
      .sort((a, b) => a - b);
    // header + 12 hàng + viền trên: các đường kẻ thân bảng cách đều nhau
    const body = ys.slice(-12);
    for (let i = 1; i < body.length; i++)
      expect(body[i] - body[i - 1]).toBeCloseTo(g.rowH, 3);
  });
});

describe("nameLines", () => {
  it("vừa một dòng thì nối tên và chữ Trung; không vừa thì chữ Trung xuống dòng", () => {
    expect(nameLines("Món A", "（甲）", "", 10, 1000)).toEqual(["Món A（甲）"]);
    expect(nameLines("Món A", "甲乙", "", 10, 1000)).toEqual(["Món A 甲乙"]);
    expect(nameLines("Món A", "（甲）", "", 10, 5)).toEqual([
      "Món A",
      "（甲）",
    ]);
    expect(nameLines("Món A", "", "", 10, 5)).toEqual(["Món A"]);
  });
});
