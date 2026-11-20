import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Line,
  Path,
  Polyline,
  Rect,
  Stop,
} from "react-native-svg";
import type { IconKey } from "../navigation/tabs";
import { PALETTES, type ThemeName } from "../theme/themes";

// Mỗi icon là danh sách hình vẽ trên khung 24x24, nét tròn. Hai bộ: xanh (hình học) và hồng (dễ thương).
type Node = [
  "path" | "circle" | "rect" | "line" | "polyline",
  Record<string, string | number>,
];
const p = (d: string): Node => ["path", { d }];
const dot = (cx: number, cy: number): Node => [
  "circle",
  { cx, cy, r: 1, fill: "$c" },
];

const BLUE: Record<IconKey, Node[]> = {
  stock: [
    p("M16.5 9.4 7.55 4.24"),
    p(
      "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
    ),
    ["polyline", { points: "3.29 7 12 12 20.71 7" }],
    ["line", { x1: 12, y1: 22, x2: 12, y2: 12 }],
  ],
  use: [
    ["rect", { x: 8, y: 2, width: 8, height: 4, rx: 1 }],
    p(
      "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
    ),
    p("M9 14h6"),
  ],
  hub: [
    // lõi năng lượng: lục giác, nhân sáng ở giữa, vòng quỹ đạo đứt nét
    p("M12 6.6 L16.7 9.3 V14.7 L12 17.4 L7.3 14.7 V9.3 Z"),
    ["circle", { cx: 12, cy: 12, r: 1.9, fill: "$c" }],
    ["circle", { cx: 12, cy: 12, r: 10, strokeDasharray: "2 3.4" }],
  ],
  catalog: [
    p("M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"),
    p("M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"),
  ],
  menu: [
    ["line", { x1: 4, y1: 6, x2: 20, y2: 6 }],
    ["line", { x1: 4, y1: 12, x2: 20, y2: 12 }],
    ["line", { x1: 4, y1: 18, x2: 20, y2: 18 }],
  ],
  order: [
    ["circle", { cx: 8, cy: 21, r: 1 }],
    ["circle", { cx: 19, cy: 21, r: 1 }],
    p(
      "M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"
    ),
  ],
  receive: [
    p("M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"),
    p("M15 18H9"),
    p(
      "M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"
    ),
    ["circle", { cx: 17, cy: 18, r: 2 }],
    ["circle", { cx: 7, cy: 18, r: 2 }],
  ],
  owed: [
    p("M5 22h14"),
    p("M5 2h14"),
    p(
      "M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"
    ),
    p("M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"),
  ],
  readOrder: [
    p("M3 7V5a2 2 0 0 1 2-2h2"),
    p("M17 3h2a2 2 0 0 1 2 2v2"),
    p("M21 17v2a2 2 0 0 1-2 2h-2"),
    p("M7 21H5a2 2 0 0 1-2-2v-2"),
    p("M7 8h8"),
    p("M7 12h10"),
    p("M7 16h6"),
  ],
  count: [
    ["rect", { x: 8, y: 2, width: 8, height: 4, rx: 1 }],
    p(
      "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
    ),
    p("m9 14 2 2 4-4"),
  ],
  expiry: [
    p("M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"),
    p("M16 2v4"),
    p("M8 2v4"),
    p("M3 10h5"),
    p("M17.5 17.5 16 16.3V14"),
    ["circle", { cx: 16, cy: 16, r: 6 }],
  ],
  export: [
    ["rect", { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
    ["circle", { cx: 9, cy: 9, r: 2 }],
    p("m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"),
  ],
};

const PINK: Record<IconKey, Node[]> = {
  stock: [
    p(
      "M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
    ),
    p(
      "M8.62 13.8A2.25 2.25 0 1 1 12 10.83a2.25 2.25 0 1 1 3.38 2.97l-2.7 2.7a.95.95 0 0 1-1.36 0z"
    ),
  ],
  use: [
    p("M6 8h12l-1.6 12.2a2 2 0 0 1-2 1.8H9.6a2 2 0 0 1-2-1.8Z"),
    p("M4.5 8h15"),
    p("m13 8 2.2-6"),
    dot(10, 17.5),
    dot(13.6, 17.8),
    dot(11.8, 14.8),
  ],
  hub: [
    // bông hoa năm cánh
    [
      "path",
      {
        d: "M12 12 C9.4 9.6 9.2 5.6 12 3 C14.8 5.6 14.6 9.6 12 12Z",
        transform: "rotate(0 12 12)",
      },
    ],
    [
      "path",
      {
        d: "M12 12 C9.4 9.6 9.2 5.6 12 3 C14.8 5.6 14.6 9.6 12 12Z",
        transform: "rotate(72 12 12)",
      },
    ],
    [
      "path",
      {
        d: "M12 12 C9.4 9.6 9.2 5.6 12 3 C14.8 5.6 14.6 9.6 12 12Z",
        transform: "rotate(144 12 12)",
      },
    ],
    [
      "path",
      {
        d: "M12 12 C9.4 9.6 9.2 5.6 12 3 C14.8 5.6 14.6 9.6 12 12Z",
        transform: "rotate(216 12 12)",
      },
    ],
    [
      "path",
      {
        d: "M12 12 C9.4 9.6 9.2 5.6 12 3 C14.8 5.6 14.6 9.6 12 12Z",
        transform: "rotate(288 12 12)",
      },
    ],
    ["circle", { cx: 12, cy: 12, r: 1.7 }],
  ],
  catalog: [
    p(
      "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"
    ),
    p(
      "M16 8.2C16 7 15 6 13.8 6c-.8 0-1.4.3-1.8.9-.4-.6-1-.9-1.8-.9C9 6 8 7 8 8.2c0 .6.3 1.2.7 1.6C10 11.1 12 13 12 13s2-1.9 3.3-3.1c.4-.4.7-1 .7-1.7z"
    ),
  ],
  menu: [
    ["line", { x1: 4, y1: 6, x2: 14, y2: 6 }],
    ["line", { x1: 4, y1: 12, x2: 20, y2: 12 }],
    ["line", { x1: 4, y1: 18, x2: 14, y2: 18 }],
    [
      "path",
      {
        d: "M19 8.4 17.3 6.8a1.05 1.05 0 0 1 1.7-1.2 1.05 1.05 0 0 1 1.7 1.2Z",
        fill: "$c",
      },
    ],
  ],
  order: [
    p("M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"),
    p("M3 6h18"),
    p("M16 10a4 4 0 0 1-8 0"),
  ],
  receive: [
    ["rect", { x: 3, y: 8, width: 18, height: 4, rx: 1 }],
    p("M12 8v13"),
    p("M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"),
    p(
      "M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"
    ),
  ],
  owed: [
    p(
      "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
    ),
    p("m12 13-1-1 2-2-3-3 2-2"),
  ],
  readOrder: [
    p(
      "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"
    ),
    ["circle", { cx: 12, cy: 13, r: 3 }],
  ],
  count: [
    ["rect", { x: 8, y: 2, width: 8, height: 4, rx: 1 }],
    p(
      "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
    ),
    p(
      "M11.4 18.3 9 15.9a1.8 1.8 0 0 1 2.6-2.5l.4.4.4-.4a1.8 1.8 0 0 1 2.6 2.5l-2.4 2.4a.85.85 0 0 1-1.2 0Z"
    ),
  ],
  expiry: [
    ["circle", { cx: 12, cy: 13, r: 8 }],
    p("M12 9v4l2 2"),
    p("M5 3 2 6"),
    p("m22 6-3-3"),
  ],
  export: [
    p("M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"),
    p("M14 3v4a2 2 0 0 0 2 2h4"),
    dot(8, 13),
    dot(16, 13),
    p("M10 16s.8 1 2 1c1.3 0 2-1 2-1"),
  ],
};

// Icon nhỏ dùng chung hai chủ đề (đăng nhập, menu).
export type GlyphKey =
  "mail" | "lock" | "eye" | "chev" | "logout" | "building" | "wifi";
const GLYPHS: Record<GlyphKey, Node[]> = {
  mail: [
    ["rect", { x: 2, y: 4, width: 20, height: 16, rx: 2 }],
    p("m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"),
  ],
  lock: [
    ["rect", { x: 3, y: 11, width: 18, height: 11, rx: 2 }],
    p("M7 11V7a5 5 0 0 1 10 0v4"),
  ],
  eye: [
    p(
      "M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"
    ),
    ["circle", { cx: 12, cy: 12, r: 3 }],
  ],
  chev: [p("m9 18 6-6-6-6")],
  logout: [
    p("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"),
    ["polyline", { points: "16 17 21 12 16 7" }],
    ["line", { x1: 21, y1: 12, x2: 9, y2: 12 }],
  ],
  building: [
    ["rect", { x: 4, y: 2, width: 16, height: 20, rx: 2 }],
    p("M9 22v-4h6v4"),
    p(
      "M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"
    ),
  ],
  wifi: [
    p("M12 20h.01"),
    p("M2 8.82a15 15 0 0 1 20 0"),
    p("M5 12.859a10 10 0 0 1 14 0"),
    p("M8.5 16.429a5 5 0 0 1 7 0"),
  ],
};

function draw(nodes: Node[], color: string) {
  return nodes.map(([tag, raw], i) => {
    const props: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(raw)) props[k] = v === "$c" ? color : v;
    if (props.fill === undefined) props.fill = "none";
    switch (tag) {
      case "path":
        return <Path key={i} {...(props as object)} />;
      case "circle":
        return <Circle key={i} {...(props as object)} />;
      case "rect":
        return <Rect key={i} {...(props as object)} />;
      case "line":
        return <Line key={i} {...(props as object)} />;
      default:
        return <Polyline key={i} {...(props as object)} />;
    }
  });
}

const frame = {
  viewBox: "0 0 24 24",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function Icon({
  name,
  theme,
  color,
  size = 24,
  strokeWidth = 1.9,
}: {
  name: IconKey;
  theme: ThemeName;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  const nodes = (theme === "pink" ? PINK : BLUE)[name];
  return (
    <Svg
      width={size}
      height={size}
      {...frame}
      stroke={color}
      strokeWidth={strokeWidth}
    >
      {draw(nodes, color)}
    </Svg>
  );
}

export function Glyph({
  name,
  color,
  size = 20,
}: {
  name: GlyphKey;
  color: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} {...frame} stroke={color} strokeWidth={1.9}>
      {draw(GLYPHS[name], color)}
    </Svg>
  );
}

// Logo A: khung lục giác + mũi tên lên (dải màu theo chủ đề).
export function Logo({
  theme,
  size = 64,
}: {
  theme: ThemeName;
  size?: number;
}) {
  const { gradFrom: a, gradTo: b } = PALETTES[theme];
  return (
    <Svg width={size} height={size} viewBox="0 0 128 128" fill="none">
      <Defs>
        <LinearGradient id="cysLogo" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={a} />
          <Stop offset="1" stopColor={b} />
        </LinearGradient>
      </Defs>
      <Path
        d="M64 10 L110 37 L110 91 L64 118 L18 91 L18 37 Z"
        stroke="url(#cysLogo)"
        strokeWidth={8}
        strokeLinejoin="round"
      />
      <Path
        d="M40 80 L64 48 L88 80"
        stroke="url(#cysLogo)"
        strokeWidth={13}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Chiếc nơ tự vẽ cho chủ đề Hồng nơ (không dùng hình nhân vật có bản quyền).
export function Bow({ color, width = 28 }: { color: string; width?: number }) {
  return (
    <Svg width={width} height={(width * 32) / 48} viewBox="0 0 48 32">
      <Path d="M24 16 C18 5 6 1 3.5 9.5 C1.5 17.5 10 25 24 16Z" fill={color} />
      <Path
        d="M24 16 C30 5 42 1 44.5 9.5 C46.5 17.5 38 25 24 16Z"
        fill={color}
      />
      <Path
        d="M24 16 C21 22 18 27 15 30 M24 16 C27 22 30 27 33 30"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        fill="none"
      />
      <Circle
        cx={24}
        cy={16}
        r={5.5}
        fill="#fff"
        stroke={color}
        strokeWidth={2.5}
      />
    </Svg>
  );
}
