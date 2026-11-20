import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  SectionList,
  Switch,
  useWindowDimensions,
  View,
} from "react-native";
import { TextInput } from "../ui/TextInput";
import { switchTrack, themedStyles } from "../theme/themedStyles";
import type { Palette } from "../theme/themes";
import { PageHeader } from "../ui/PageHeader";
import { Text } from "../ui/Text";
import { Loading } from "../ui/Loading";
import type { Tables } from "../lib/database.types";
import { WIDE_LAYOUT } from "../navigation/adminWeb";
import { loadCatalog, subscribeCatalog } from "./api";
import { ItemForm } from "./ItemForm";
import { buildSections } from "./sections";

type Props = {
  branchId: string;
};

type SectionData = {
  group: Tables<"item_groups">;
  data: Tables<"items">[];
};

export function CatalogScreen({ branchId }: Props) {
  const wide = useWindowDimensions().width >= WIDE_LAYOUT;
  const [groups, setGroups] = useState<Tables<"item_groups">[]>([]);
  const [items, setItems] = useState<Tables<"items">[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<Tables<"items"> | null>(null);

  // Chỉ nhận kết quả của lần tải mới nhất; lần tải cũ về sau bị bỏ.
  const latestRequest = useRef(0);
  const fetchCatalog = useCallback(async () => {
    const request = ++latestRequest.current;
    setError(false);
    try {
      const data = await loadCatalog(branchId);
      if (request !== latestRequest.current) return;
      setGroups(data.groups);
      setItems(data.items);
    } catch {
      if (request === latestRequest.current) setError(true);
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    setLoading(true);
    void fetchCatalog();
    // Gộp loạt sự kiện realtime (ví dụ script nạp N món) thành một lần tải.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeCatalog(branchId, () => {
      clearTimeout(timer);
      timer = setTimeout(() => void fetchCatalog(), 300);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [branchId, fetchCatalog]);

  const sections = useMemo<SectionData[]>(() => {
    return buildSections(groups, items, { query, showHidden }).map((s) => ({
      group: s.group,
      data: s.items,
    }));
  }, [groups, items, query, showHidden]);

  function openCreate() {
    setEditingItem(null);
    setFormVisible(true);
  }

  function openEdit(item: Tables<"items">) {
    setEditingItem(item);
    setFormVisible(true);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Loading />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>
          Không tải được Danh mục. Kiểm tra mạng.
        </Text>
        <Pressable
          style={styles.retryButton}
          onPress={() => {
            setLoading(true);
            void fetchCatalog();
          }}
          accessibilityRole="button"
        >
          <Text style={styles.retryText}>Thử lại</Text>
        </Pressable>
      </View>
    );
  }

  const isCatalogEmpty = groups.length === 0 && items.length === 0;

  return (
    <View style={styles.container}>
      {wide && (
        <PageHeader
          title="Danh mục"
          sub={`${items.length} món · ${groups.length} nhóm`}
          style={styles.headWide}
        />
      )}
      <View style={[styles.toolbar, wide && styles.toolbarWide]}>
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm món (gõ không dấu được)"
          value={query}
          onChangeText={setQuery}
        />
        <View style={styles.controlsRow}>
          <View style={styles.switchWrap}>
            <Switch
              value={showHidden}
              onValueChange={setShowHidden}
              trackColor={switchTrack()}
            />
            <Text style={styles.switchText}>Hiện món đã ẩn</Text>
          </View>
          <Pressable
            style={styles.addButton}
            onPress={openCreate}
            accessibilityRole="button"
          >
            <Text style={styles.addButtonText}>+ Thêm món</Text>
          </Pressable>
        </View>
      </View>

      {isCatalogEmpty ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            Chưa có món nào. Bấm + Thêm món, hoặc nạp bằng script (npm run
            import-catalog).
          </Text>
        </View>
      ) : wide ? (
        <ScrollView contentContainerStyle={styles.tablePage}>
          <View style={styles.tableCard}>
            <View style={[styles.tr, styles.thRow]}>
              <Text style={[styles.th, styles.colName]}>TÊN MÓN</Text>
              <Text style={[styles.th, styles.colUnit]}>ĐƠN VỊ</Text>
              <Text style={[styles.th, styles.colCase]}>QUY CÁCH</Text>
              <Text style={[styles.th, styles.colState]}>TRẠNG THÁI</Text>
            </View>
            {sections.length === 0 && (
              <Text style={[styles.emptyText, styles.emptyWide]}>
                Không có món phù hợp.
              </Text>
            )}
            {sections.map((sec) => (
              <View key={sec.group.id}>
                <View style={styles.groupRow}>
                  <Text style={styles.sectionTitle}>
                    {sec.group.name}
                    {sec.group.name_zh ? ` (${sec.group.name_zh})` : ""}
                  </Text>
                </View>
                {sec.data.map((item) => (
                  <Pressable
                    key={item.id}
                    style={({ pressed }) => [
                      styles.tr,
                      pressed && styles.rowPressed,
                    ]}
                    onPress={() => openEdit(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Sửa món ${item.name}`}
                  >
                    <Text style={[styles.itemName, styles.colName]}>
                      {item.name}
                      {item.name_zh ? ` · ${item.name_zh}` : ""}
                    </Text>
                    <Text style={[styles.cellText, styles.colUnit]}>
                      {item.unit}
                      {item.unit_zh ? ` (${item.unit_zh})` : ""}
                    </Text>
                    <Text style={[styles.cellText, styles.colCase]}>
                      {item.case_size !== null
                        ? `${item.case_size}/thùng`
                        : "—"}
                    </Text>
                    <View style={styles.colState}>
                      {item.is_hidden ? (
                        <View style={styles.hiddenBadge}>
                          <Text style={styles.hiddenBadgeText}>Đã ẩn</Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <SectionList<Tables<"items">, SectionData>
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {section.group.name}
                {section.group.name_zh ? ` (${section.group.name_zh})` : ""}
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <Pressable
              style={styles.itemRow}
              onPress={() => openEdit(item)}
              accessibilityRole="button"
            >
              <View style={styles.itemMain}>
                <Text style={styles.itemName}>
                  {item.name}
                  {item.name_zh ? ` · ${item.name_zh}` : ""}
                </Text>
                <Text style={styles.itemSub}>
                  {item.unit}
                  {item.unit_zh ? ` (${item.unit_zh})` : ""}
                  {item.case_size !== null ? ` · ${item.case_size}/thùng` : ""}
                </Text>
              </View>
              {item.is_hidden && (
                <View style={styles.hiddenBadge}>
                  <Text style={styles.hiddenBadgeText}>Đã ẩn</Text>
                </View>
              )}
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>Không có món phù hợp.</Text>
            </View>
          }
        />
      )}

      <ItemForm
        visible={formVisible}
        groups={groups}
        initial={editingItem}
        branchId={branchId}
        onClose={() => setFormVisible(false)}
        onSaved={() => {
          setFormVisible(false);
          void fetchCatalog();
        }}
      />
    </View>
  );
}

const styles = themedStyles((c: Palette) => ({
  container: { flex: 1, width: "100%" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  toolbar: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: c.surface,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  switchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
  },
  switchText: { fontSize: 14, color: c.ink },
  addButton: {
    backgroundColor: c.accentDeep,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  addButtonText: { color: c.onAccent, fontSize: 15, fontWeight: "600" },
  listContent: { paddingBottom: 32 },
  headWide: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
  },
  toolbarWide: { paddingHorizontal: 24, borderBottomWidth: 0 },
  tablePage: { padding: 24, paddingTop: 8 },
  tableCard: {
    width: "100%",
    maxWidth: 1200,
    alignSelf: "center",
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 16,
    overflow: "hidden",
  },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  rowPressed: { backgroundColor: c.accentSoft },
  thRow: { minHeight: 40, backgroundColor: c.accentSoft },
  th: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: c.muted },
  groupRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: c.bg,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  colName: { flex: 4 },
  colUnit: { flex: 2 },
  colCase: { flex: 1.5 },
  colState: { flex: 1.5 },
  cellText: { fontSize: 14, color: c.ink },
  emptyWide: { padding: 24 },
  sectionHeader: {
    backgroundColor: c.accentSoft,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: c.accentDeep },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: c.accentSoft,
    backgroundColor: c.surface,
    gap: 12,
  },
  itemMain: { flex: 1, gap: 2 },
  itemName: { fontSize: 16, fontWeight: "600", color: c.ink },
  itemSub: { fontSize: 14, color: c.muted },
  hiddenBadge: {
    backgroundColor: c.accentSoft,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  hiddenBadgeText: { fontSize: 12, fontWeight: "600", color: c.muted },
  error: { color: c.red, textAlign: "center", fontSize: 15 },
  retryButton: {
    backgroundColor: c.accentDeep,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  retryText: { color: c.onAccent, fontSize: 15, fontWeight: "600" },
  emptyText: { color: c.muted, textAlign: "center", fontSize: 15 },
}));
