import { useMemo, type ComponentRef, type Ref } from "react";
import { Platform, Text, View, type ViewStyle } from "react-native";
import type { SheetModel } from "./exportSheet";
import { nameLines, sheetGeometry } from "./sheetGeometry";

// Tờ giấy Đặt hàng / Tồn kho vẽ theo mẫu in của quán (khổ dọc 1 : 1,414). Màu cố định, không theo chủ đề:
// tờ được lưu thành ảnh để gửi đi nên luôn đen trắng như bản in, số điền tay bằng mực xanh.
const INK = "#111111";
const BLUE = "#1F3FAE";
const GREY = "#D9D9D9";
const SERIF = Platform.select({ ios: "Times New Roman", default: "serif" });

type Props = {
  model: SheetModel;
  date: string;
  orderer: string; // chỉ tờ Đặt hàng có tên người đặt
  width: number;
  shotRef: Ref<ComponentRef<typeof View>>;
};

export function PaperSheet({ model, date, orderer, width, shotRef }: Props) {
  const {
    u,
    cols: COLS,
    height,
    tableW,
    rowH,
    nameColW,
    nameFs,
    unitFs,
    titleText,
    titleFs,
  } = sheetGeometry(model, width);
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
        style={{
          fontFamily: SERIF,
          fontWeight: "700",
          fontSize: titleFs,
          color: INK,
        }}
      >
        {titleText}
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
                style={[
                  cell,
                  {
                    height: rowH,
                    paddingHorizontal: 1 * u,
                    alignItems: "center", // giữa ô theo chiều ngang (dọc đã có justifyContent ở cell)
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.5}
                  style={{
                    fontFamily: SERIF,
                    fontWeight: "700",
                    fontSize: 2.5 * u,
                    color: INK,
                    textAlign: "center",
                    width: "100%",
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

// Tên + chữ Trung (+ ghi chú): cách xuống dòng tính ở nameLines (dùng chung với ảnh vẽ canvas).
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
  const lines = nameLines(name, zh, note, fs, avail);
  if (lines.length === 1) return <Text style={style}>{lines[0]}</Text>;
  return (
    <View>
      {lines.map((line, i) => (
        <Text key={i} style={style}>
          {line}
        </Text>
      ))}
    </View>
  );
}
