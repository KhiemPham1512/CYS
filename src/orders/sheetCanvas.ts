import type { SheetModel } from "./exportSheet";
import { nameLines, sheetGeometry } from "./sheetGeometry";

// Vẽ ảnh tờ giấy trên web bằng canvas, theo toạ độ tính sẵn (sheetGeometry), thay cho chụp DOM bằng html2canvas:
// bộ chụp DOM trên iPhone Safari làm các cột lệch hàng nhau. Ở đây mỗi hàng dùng chung một mốc y cho STT, tên,
// đơn vị và số lượng nên không thể lệch.
const INK = "#111111";
const BLUE = "#1F3FAE";
const GREY = "#D9D9D9";
const FONT = '"Times New Roman", Times, serif';

// Phần của CanvasRenderingContext2D mà bộ vẽ dùng (để kiểm bằng ngữ cảnh giả).
export type Ctx = {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
};

export function drawSheet(
  ctx: Ctx,
  W: number, // chiều rộng ảnh (px); mọi kích thước tính theo đó như bản xem trước
  model: SheetModel,
  date: string,
  orderer: string
): void {
  // Độ dày nét theo tỉ lệ so với bản xem trước ~366 px.
  const g = sheetGeometry(model, W);
  const { u, cols, tableW, rowH, headH } = g;
  const px = W / 366;
  const left = 5 * u;
  const bold = (fs: number) => `700 ${fs}px ${FONT}`;

  const text = (
    s: string,
    x: number,
    y: number,
    fs: number,
    color: string,
    align: CanvasTextAlign,
    weight = true
  ) => {
    ctx.font = weight ? bold(fs) : `${fs}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(s, x, y);
  };
  // Khối nhiều dòng căn giữa theo chiều dọc trong ô [top, top + h].
  const block = (
    lines: string[],
    x: number,
    top: number,
    h: number,
    fs: number,
    lh: number,
    align: CanvasTextAlign
  ) => {
    const start = top + (h - lines.length * lh) / 2 + lh / 2;
    lines.forEach((l, i) => text(l, x, start + i * lh, fs, INK, align));
  };
  const line = (x1: number, y1: number, x2: number, y2: number, w: number) => {
    ctx.strokeStyle = INK;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, Math.ceil(g.height));

  // Tiêu đề và hàng Ngày / Người đặt hàng.
  let y = 4.5 * u;
  text(g.titleText, left, y + (g.titleFs * 1.2) / 2, g.titleFs, INK, "left");
  y += g.titleFs * 1.2 + 3.2 * u;
  const metaH = 3.2 * u * 1.2;
  text("Ngày :", left, y + metaH / 2, 2.5 * u, INK, "left");
  ctx.font = bold(2.5 * u);
  const dateX = left + ctx.measureText("Ngày :").width + 1.5 * u;
  text(date.slice(0, 5), dateX, y + metaH / 2, 3.2 * u, BLUE, "left", false);
  const ordX = left + tableW * 0.46;
  text("Người đặt hàng :", ordX, y + metaH / 2, 2.5 * u, INK, "left");
  ctx.font = bold(2.5 * u);
  text(
    orderer,
    ordX + ctx.measureText("Người đặt hàng :").width + 1.5 * u,
    y + metaH / 2,
    3.2 * u,
    BLUE,
    "left",
    false
  );
  y += metaH + 1.2 * u;

  // Biên cột (x) của STT, LOẠI, TÊN, ĐƠN VỊ, SỐ LƯỢNG.
  const xs = [left];
  for (const f of [cols.stt, cols.cat, cols.name, cols.unit, cols.qty])
    xs.push(xs[xs.length - 1] + tableW * f);
  const top = y;
  const bodyTop = top + headH;
  const bottom = bodyTop + rowH * model.rows.length;

  // Tiêu đề cột.
  ctx.fillStyle = GREY;
  ctx.fillRect(left, top, tableW, headH);
  const heads: [string, string][] = [
    ["STT", "序號"],
    ["LOẠI", "類"],
    ["TÊN NGUYÊN VẬT LIỆU", "原材料名"],
    ["ĐƠN VỊ", "單位"],
    [model.qtyLabel, "數量"],
  ];
  heads.forEach((h, i) =>
    block(
      [...h],
      (xs[i] + xs[i + 1]) / 2,
      top,
      headH,
      1.95 * u,
      1.95 * u * 1.2,
      "center"
    )
  );

  // Các hàng: mọi ô cùng hàng dùng chung rowTop nên thẳng hàng tuyệt đối.
  model.rows.forEach((r, i) => {
    const rowTop = bodyTop + i * rowH;
    block(
      [String(r.stt)],
      (xs[0] + xs[1]) / 2,
      rowTop,
      rowH,
      2.4 * u,
      2.4 * u * 1.2,
      "center"
    );
    block(
      nameLines(r.name, r.zh, r.note, g.nameFs, g.nameColW),
      xs[2] + 1.2 * u,
      rowTop,
      rowH,
      g.nameFs,
      g.nameFs * 1.2,
      "left"
    );
    block(
      [r.unit, ...(r.unitZh ? [r.unitZh] : [])],
      (xs[3] + xs[4]) / 2,
      rowTop,
      rowH,
      g.unitFs,
      g.unitFs * 1.2,
      "center"
    );
    // Số lượng thu nhỏ cho vừa ô (adjustsFontSizeToFit không chạy trên web).
    let fs = 2.5 * u;
    const avail = tableW * cols.qty - 2 * u;
    ctx.font = bold(fs);
    const w = ctx.measureText(r.qty).width;
    if (w > avail) fs = Math.max(fs * 0.5, (fs * avail) / w);
    block([r.qty], (xs[4] + xs[5]) / 2, rowTop, rowH, fs, fs * 1.2, "center");
  });

  // Ô LOẠI gộp theo Nhóm.
  let at = 0;
  for (const c of model.categories) {
    const cTop = bodyTop + at * rowH;
    const lines = [...c.label.split(" "), ...c.labelZh.split(" ")].filter(
      Boolean
    );
    block(
      lines,
      (xs[1] + xs[2]) / 2,
      cTop,
      c.span * rowH,
      2 * u,
      2.4 * u,
      "center"
    );
    at += c.span;
  }

  // Kẻ ô: dọc theo mọi biên cột, ngang theo từng hàng (cột LOẠI chỉ kẻ ở cuối mỗi Nhóm).
  const lw = px;
  for (let i = 1; i < xs.length; i++) line(xs[i], top, xs[i], bottom, lw);
  line(left, top + headH, xs[5], top + headH, lw);
  for (let i = 1; i <= model.rows.length; i++) {
    const yy = bodyTop + i * rowH;
    line(xs[0], yy, xs[1], yy, lw);
    line(xs[2], yy, xs[5], yy, lw);
  }
  let end = 0;
  for (const c of model.categories) {
    end += c.span;
    const yy = bodyTop + end * rowH;
    line(xs[1], yy, xs[2], yy, lw);
  }
  line(left, top, xs[5], top, 1.6 * px); // viền trên và trái đậm hơn như mẫu
  line(left, top, left, bottom, 1.6 * px);
}

// Vẽ ra ảnh PNG (data URI) khổ width x height; chỉ chạy trên web (cần document).
export function renderSheetDataUri(
  model: SheetModel,
  date: string,
  orderer: string,
  width = 1240,
  height = 1754
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Không vẽ được ảnh (canvas)");
  drawSheet(ctx, width, model, date, orderer);
  return canvas.toDataURL("image/png");
}
