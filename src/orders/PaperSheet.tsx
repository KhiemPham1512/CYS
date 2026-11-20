import { useMemo, type ComponentRef, type Ref } from "react";
import { Platform, Text, View, type ViewStyle } from "react-native";
import type { SheetModel } from "./exportSheet";

// Tờ giấy Đặt hàng / Tồn kho vẽ theo mẫu in của quán (khổ dọc 1 : 1,414). Màu cố định, không theo chủ đề:
// tờ được lưu thành ảnh để gửi đi nên luôn đen trắng như bản in, số điền tay bằng mực xanh.
const INK = "#111111";
const BLUE = "#1F3FAE";
const GREY = "#D9D9D9";
const SERIF = Platform.select({ ios: "Times New Roman", default: "serif" });

// Phân chia cột theo mẫu: STT, LOẠI, TÊN, ĐƠN VỊ, SỐ LƯỢNG (tỷ lệ chiều rộng bảng).
const FIXED = { stt: 0.06, unit: 0.12, qty: 0.17 };

// Ước lượng độ rộng chữ theo em: chữ Trung rộng 1 em, chữ Latin in đậm khoảng 0,55 em.
const textEm = (str: string) =>
  [...str].reduce(
    (w, ch) => w + ((ch.codePointAt(0) ?? 0) > 0x2e80 ? 1 : 0.55),
    0
  );

type Props = {
  model: SheetModel;
  date: string;
  orderer: string; // chỉ tờ Đặt hàng có tên người đặt
  width: number;
  shotRef: Ref<ComponentRef<typeof View>>;
};

export function PaperSheet({ model, date, orderer, width, shotRef }: Props) {
  const u = width / 100;
  const cat = model.categories.some((c) => c.label.length > 8) ? 0.14 : 0.12;
  const COLS = {
    ...FIXED,
    cat,
    name: 1 - FIXED.stt - FIXED.unit - FIXED.qty - cat,
  };
  const height = width * 1.414;
  const tableW = width - 10 * u;
  const n = Math.max(model.rows.length, 1);
  // Các dòng chia đều chiều cao bảng: ít dòng thì dòng cao, nhiều dòng thì thấp (như mẫu), có trần.
  const rowH = Math.min(0.108 * width, (height * 0.68) / n);
  const nameColW = tableW * COLS.name - 2.4 * u;
  const longest = Math.max(...model.rows.map((r) => textEm(r.name)), 1);
  const baseFs =
    (model.rows.length > 16 ? 1.95 : model.rows.length > 12 ? 2.4 : 2.5) * u;
  const nameFs = Math.min(baseFs, nameColW / longest);
  const unitFs = (model.rows.length > 16 ? 1.8 : 2.1) * u;
  const cell = useMemo(
    (): ViewStyle => ({
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: INK,
      justifyContent: "center",
    }),
    []
  );
  const col = (f: number) => ({ width: tableW * f });
  const lastCol = (f: number): ViewStyle => ({ width: tableW * f });

  return (
    <View
      ref={shotRef}
      collapsable={false}
      style={{
        width,
        height,
        backgroundColor: "#FFFFFF",
        paddingHorizontal: 5 * u,
        paddingTop: 4.5 * u,
      }}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={{
          fontFamily: SERIF,
          fontWeight: "700",
          fontSize: 4.4 * u,
          color: INK,
        }}
      >
        {model.title}
        {model.titleZh ? `   ${model.titleZh}` : ""}
      </Text>

      <View
        style={{
          flexDirection: "row",
          marginTop: 3.2 * u,
          marginBottom: 1.2 * u,
        }}
      >
        <View style={{ width: "46%", flexDirection: "row" }}>
          <Text
            style={{
              fontFamily: SERIF,
              fontWeight: "700",
              fontSize: 2.5 * u,
              color: INK,
            }}
          >
            Ngày :
          </Text>
          <Text
            style={{
              fontFamily: SERIF,
              fontSize: 3.2 * u,
              color: BLUE,
              marginLeft: 1.5 * u,
            }}
          >
            {date.slice(0, 5)}
          </Text>
        </View>
        <View style={{ flex: 1, flexDirection: "row" }}>
          <Text
            style={{
              fontFamily: SERIF,
              fontWeight: "700",
              fontSize: 2.5 * u,
              color: INK,
            }}
          >
            Người đặt hàng :
          </Text>
          <Text
            style={{
              fontFamily: SERIF,
              fontSize: 3.2 * u,
              color: BLUE,
              marginLeft: 1.5 * u,
            }}
          >
            {orderer}
          </Text>
        </View>
      </View>

      <View
        style={{
          width: tableW,
          borderTopWidth: 1.6,
          borderLeftWidth: 1.6,
          borderColor: INK,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            height: 7.5 * u,
            backgroundColor: GREY,
          }}
        >
          <Head
            f={COLS.stt}
            lines={["STT", "序號"]}
            u={u}
            w={col(COLS.stt)}
            cell={cell}
          />
          <Head
            f={COLS.cat}
            lines={["LOẠI", "類"]}
            u={u}
            w={col(COLS.cat)}
            cell={cell}
          />
          <Head
            f={COLS.name}
            lines={["TÊN NGUYÊN VẬT LIỆU", "原材料名"]}
            u={u}
            w={col(COLS.name)}
            cell={cell}
          />
          <Head
            f={COLS.unit}
            lines={["ĐƠN VỊ", "單位"]}
            u={u}
            w={col(COLS.unit)}
            cell={cell}
          />
          <Head
            f={COLS.qty}
            lines={[model.qtyLabel, "數量"]}
            u={u}
            w={lastCol(COLS.qty)}
            cell={cell}
          />
        </View>

        <View style={{ flexDirection: "row" }}>
          <View style={col(COLS.stt)}>
            {model.rows.map((r) => (
              <View
                key={r.stt}
                style={[cell, { height: rowH, alignItems: "center" }]}
              >
                <Text
                  style={{
                    fontFamily: SERIF,
                    fontWeight: "700",
                    fontSize: 2.4 * u,
                    color: INK,
                  }}
                >
                  {r.stt}
                </Text>
              </View>
            ))}
          </View>

          <View style={col(COLS.cat)}>
            {model.categories.map((c, i) => (
              <View
                key={i}
                style={[
                  cell,
                  {
                    height: c.span * rowH,
                    alignItems: "center",
                    paddingHorizontal: 0.6 * u,
                  },
                ]}
              >
                {[...c.label.split(" "), ...c.labelZh.split(" ")]
                  .filter(Boolean)
                  .map((line, j) => (
                    <Text
                      key={j}
                      numberOfLines={1}
                      style={{
                        fontFamily: SERIF,
                        fontWeight: "700",
                        fontSize: 2 * u,
                        lineHeight: 2.4 * u,
                        color: INK,
                        textAlign: "center",
                      }}
                    >
                      {line}
                    </Text>
                  ))}
              </View>
            ))}
          </View>

          <View style={col(COLS.name)}>
            {model.rows.map((r) => (
              <View
                key={r.stt}
                style={[cell, { height: rowH, paddingHorizontal: 1.2 * u }]}
              >
                <NameCell
                  name={r.name}
                  zh={r.zh}
                  note={r.note}
                  fs={nameFs}
                  avail={nameColW}
                />
              </View>
            ))}
          </View>

          <View style={col(COLS.unit)}>
            {model.rows.map((r) => (
              <View
                key={r.stt}
                style={[cell, { height: rowH, alignItems: "center" }]}
              >
                <Text
                  style={{
                    fontFamily: SERIF,
                    fontWeight: "700",
                    fontSize: unitFs,
                    lineHeight: unitFs * 1.2,
                    color: INK,
                    textAlign: "center",
                  }}
                >
                  {r.unit}
                  {r.unitZh ? `\n${r.unitZh}` : ""}
                </Text>
              </View>
            ))}
          </View>

          <View style={lastCol(COLS.qty)}>
            {model.rows.map((r) => (
              <View
                key={r.stt}
                style={[cell, { height: rowH, paddingHorizontal: 1.4 * u }]}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.5}
                  style={{
                    fontFamily: SERIF,
                    fontWeight: "700",
                    fontSize: 3.4 * u,
                    color: BLUE,
                  }}
                >
                  {r.qty}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function Head({
  lines,
  u,
  w,
  cell,
}: {
  f: number;
  lines: [string, string];
  u: number;
  w: ViewStyle;
  cell: ViewStyle;
}) {
  return (
    <View
      style={[cell, w, { alignItems: "center", paddingHorizontal: 0.5 * u }]}
    >
      <Text
        style={{
          fontFamily: SERIF,
          fontWeight: "700",
          fontSize: 1.95 * u,
          color: INK,
          textAlign: "center",
        }}
      >
        {lines[0]}
        {"\n"}
        {lines[1]}
      </Text>
    </View>
  );
}

// Tên + chữ Trung (+ ghi chú) cùng một dòng như mẫu; ước lượng không vừa một dòng thì cả khối chữ Trung xuống dòng dưới.
function NameCell({
  name,
  zh,
  note,
  fs,
  avail,
}: {
  name: string;
  zh: string;
  note: string;
  fs: number;
  avail: number;
}) {
  const style = {
    fontFamily: SERIF,
    fontWeight: "700" as const,
    fontSize: fs,
    lineHeight: fs * 1.2,
    color: INK,
  };
  // Ngoặc toàn chiều rộng tự có khoảng trống; còn lại cách một dấu cách.
  const glue = zh && !zh.startsWith("（") ? " " : "";
  const tail = [zh ? `${glue}${zh}` : "", note].filter(Boolean).join(" ");
  if (!tail) return <Text style={style}>{name}</Text>;
  if (textEm(name + tail) * fs > avail)
    return (
      <View>
        <Text style={style}>{name}</Text>
        <Text style={style}>{tail.trimStart()}</Text>
      </View>
    );
  return (
    <Text style={style}>
      {name}
      {tail}
    </Text>
  );
}
