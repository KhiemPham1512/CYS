import type { SheetModel } from "./exportSheet";

// Kích thước tờ giấy Đặt hàng / Tồn kho (khổ dọc 1 : 1,414), dùng chung cho bản xem trước (PaperSheet)
// và bản vẽ ảnh trên web (sheetCanvas), để hai nơi luôn cùng một cách chia cột, hàng và cỡ chữ.

// Phân chia cột theo mẫu: STT, LOẠI, TÊN, ĐƠN VỊ, SỐ LƯỢNG (tỷ lệ chiều rộng bảng).
export const FIXED = { stt: 0.06, unit: 0.12, qty: 0.17 };

// Ước lượng độ rộng chữ theo em: chữ Trung rộng 1 em, chữ Latin in đậm khoảng 0,55 em.
export const textEm = (str: string) =>
  [...str].reduce(
    (w, ch) => w + ((ch.codePointAt(0) ?? 0) > 0x2e80 ? 1 : 0.55),
    0
  );

export function sheetGeometry(model: SheetModel, width: number) {
  const u = width / 100;
  const cat = model.categories.some((c) => c.label.length > 8) ? 0.14 : 0.12;
  const cols = {
    ...FIXED,
    cat,
    name: 1 - FIXED.stt - FIXED.unit - FIXED.qty - cat,
  };
  const height = width * 1.414;
  const tableW = width - 10 * u;
  const n = Math.max(model.rows.length, 1);
  // Các dòng chia đều chiều cao bảng: ít dòng thì dòng cao, nhiều dòng thì thấp (như mẫu), có trần.
  const rowH = Math.min(0.108 * width, (height * 0.68) / n);
  const nameColW = tableW * cols.name - 2.4 * u;
  const longest = Math.max(...model.rows.map((r) => textEm(r.name)), 1);
  const baseFs =
    (model.rows.length > 16 ? 1.95 : model.rows.length > 12 ? 2.4 : 2.5) * u;
  const nameFs = Math.min(baseFs, nameColW / longest);
  const unitFs = (model.rows.length > 16 ? 1.8 : 2.1) * u;
  // Tiêu đề (kèm chữ Trung) thu nhỏ vừa khổ giấy; adjustsFontSizeToFit không chạy trên web nên tính tay.
  const titleText = `${model.title}${model.titleZh ? `   ${model.titleZh}` : ""}`;
  const titleFs = Math.min(4.4 * u, (tableW * 0.95) / textEm(titleText));
  return {
    u,
    cols,
    height,
    tableW,
    rowH,
    nameColW,
    nameFs,
    unitFs,
    titleText,
    titleFs,
    headH: 7.5 * u,
  };
}

// Tên + chữ Trung (+ ghi chú) cùng một dòng như mẫu; ước lượng không vừa một dòng thì cả khối chữ Trung xuống dòng dưới.
export function nameLines(
  name: string,
  zh: string,
  note: string,
  fs: number,
  avail: number
): string[] {
  // Ngoặc toàn chiều rộng tự có khoảng trống; còn lại cách một dấu cách.
  const glue = zh && !zh.startsWith("（") ? " " : "";
  const tail = [zh ? `${glue}${zh}` : "", note].filter(Boolean).join(" ");
  if (!tail) return [name];
  if (textEm(name + tail) * fs > avail) return [name, tail.trimStart()];
  return [name + tail];
}
