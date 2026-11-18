import { describe, expect, it } from "vitest";
import { buildSections } from "./sections";

const groups = [
  { id: "g2", name: "Trà", sort_order: 2 },
  { id: "g1b", name: "Đóng gói", sort_order: 1 },
  { id: "g1a", name: "Bột", sort_order: 1 },
  { id: "g3", name: "Nhóm trống", sort_order: 3 },
];

const items = [
  {
    id: "i1",
    group_id: "g2",
    name: "Trà xanh",
    name_zh: "綠茶",
    is_hidden: false,
    sort_order: 1000,
  },
  {
    id: "i2",
    group_id: "g2",
    name: "Hồng trà",
    name_zh: "紅茶",
    is_hidden: false,
    sort_order: 1000,
  },
  {
    id: "i3",
    group_id: "g2",
    name: "Trà ẩn",
    name_zh: null,
    is_hidden: true,
    sort_order: 1000,
  },
  {
    id: "i4",
    group_id: "g1b",
    name: "Ly nhựa",
    name_zh: null,
    is_hidden: false,
    sort_order: 1000,
  },
];

describe("buildSections", () => {
  it("sắp nhóm theo sort_order rồi tên tiếng Việt, món theo tên tiếng Việt", () => {
    const sections = buildSections(groups, items, {
      query: "",
      showHidden: false,
    });
    expect(sections.map((s) => s.group.id)).toEqual(["g1a", "g1b", "g2", "g3"]);
    expect(sections[2].items.map((i) => i.name)).toEqual([
      "Hồng trà",
      "Trà xanh",
    ]);
  });

  it("ẩn/hiện món đã ẩn theo showHidden", () => {
    const hiddenOff = buildSections(groups, items, {
      query: "",
      showHidden: false,
    });
    expect(hiddenOff[2].items.map((i) => i.id)).toEqual(["i2", "i1"]);

    const hiddenOn = buildSections(groups, items, {
      query: "",
      showHidden: true,
    });
    expect(hiddenOn[2].items.map((i) => i.id)).toEqual(["i2", "i3", "i1"]);
  });

  it("lọc không dấu và bỏ nhóm trống khi có query", () => {
    const sections = buildSections(groups, items, {
      query: "hong tra",
      showHidden: false,
    });
    expect(sections).toHaveLength(1);
    expect(sections[0].group.id).toBe("g2");
    expect(sections[0].items.map((i) => i.name)).toEqual(["Hồng trà"]);
  });
});

describe("buildSections — thứ tự món như trên tờ", () => {
  const g = [{ id: "g", name: "Thạch", sort_order: 1 }];
  const mk = (id: string, name: string, sort_order: number) => ({
    id,
    group_id: "g",
    name,
    name_zh: null,
    is_hidden: false,
    sort_order,
  });

  it("món xếp theo sort_order trước, cùng sort_order thì theo tên", () => {
    const sections = buildSections(
      g,
      [
        mk("c", "Cà", 3),
        mk("a", "Zebra", 1),
        mk("b", "Bánh", 2),
        mk("d", "An", 2),
      ],
      { query: "", showHidden: false }
    );
    expect(sections[0].items.map((i) => i.id)).toEqual(["a", "d", "b", "c"]);
  });
});
