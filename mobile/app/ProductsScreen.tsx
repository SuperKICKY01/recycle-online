/**
 * THE SHOP'S PRODUCTS, CATEGORIES AND UNITS — one segmented management screen
 * (P1.15, homed on the phone). Reached from an ADMIN-ONLY row inside settings; a
 * staff session never sees the entry, and every write route is `require_admin`
 * regardless. ONLINE ONLY by construction: it lists retired rows the yard cache
 * does not hold, so it reads live and offline it says so (src/products/productsAdmin.ts).
 *
 * PRESENTATION ONLY. Every sentence, gate, bound, the grouping, the SEARCH and the
 * FILTER come from src/products/productsAdmin.ts, where a headless proof reaches
 * them; this file owns only the tab, the filter and the add-form BUFFERS. Search and
 * filter run ON THE DEVICE over the set the last read fetched — instant on the pure
 * data; a create/edit reloads that set. Per-product edit / deactivate is the
 * ProductActionsSheet's, opened over this one through the single SheetHost.
 *
 * WHY A SEGMENTED CONTROL AND NOT THREE SHEETS. Categories and units are managed
 * INLINE here, in the same sheet, because a product cannot be created without them
 * and because a per-entity actions sheet would push the stack to FOUR deep, which
 * prove:sheets forbids. The depth limit decided the shape.
 *
 * NO MODAL ELEMENT AND NO `visible` PROP. One Modal exists (app/SheetHost) and the
 * sheet stack decides what is inside it; `npm run prove:sheets` reddens if a second
 * Modal appears in this directory.
 */
import { useMemo, useState } from "react";
import { ScrollView, SectionList, StyleSheet, Text, View } from "react-native";

import {
  checkNewEntity,
  checkNewProduct,
  checkRenameEntity,
  entityListModel,
  NO_FILTER,
  productListModel,
  PRODUCT_CODE_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  type ActivityFilter,
  type AdminEntity,
  type AdminProduct,
  type EntityCreateBody,
  type EntityKind,
  type EntityRow,
  type ProductCreateBody,
  type ProductFilter,
  type ProductListRow,
  type ProductsMessage,
  type ProductsScreenState,
  type ProductTab,
} from "../src/products/productsAdmin";
import { Badge, Button, Card, EmptyState, Field, GroupCard, Row, SectionHeading, Segmented, type Tone } from "./Kit";
import { SheetHeader } from "./SheetHeader";
import { Touchable } from "./Press";
import { useTheme, type ThemeTokens } from "./theme";

const MESSAGE_TONE: Record<ProductsMessage["tone"], Tone> = {
  offline: "warning",
  session: "info",
  error: "danger",
};

const TAB_OPTIONS: readonly { value: ProductTab; label: string }[] = [
  { value: "products", label: "สินค้า" },
  { value: "categories", label: "หมวดหมู่" },
  { value: "units", label: "หน่วยนับ" },
];

const ACTIVITY_OPTIONS: readonly { value: ActivityFilter; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "active", label: "ใช้งาน" },
  { value: "inactive", label: "ปิดใช้งาน" },
];

export function ProductsScreen({
  state,
  refusal,
  busy,
  onClose,
  onRetry,
  onSignIn,
  onCreateProduct,
  onProductMenu,
  onCreateEntity,
  onRenameEntity,
  onDeactivateEntity,
  onReactivateEntity,
}: {
  /** The three lists or a message, or null while the first read is in flight. */
  readonly state: ProductsScreenState | null;
  /** The last write's refusal, worded by productsAdmin, or null. Shown above the body. */
  readonly refusal: string | null;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onRetry: () => void;
  readonly onSignIn: () => void;
  /** The app POSTs the product create and re-reads; this passes a valid body. */
  readonly onCreateProduct: (body: ProductCreateBody) => void;
  /** Open the ⋯ actions for a product. App.tsx writes the target WITH the open. */
  readonly onProductMenu: (product: AdminProduct) => void;
  /** The app POSTs a category/unit create and re-reads. */
  readonly onCreateEntity: (kind: EntityKind, body: EntityCreateBody) => void;
  readonly onRenameEntity: (kind: EntityKind, id: string, name: string) => void;
  readonly onDeactivateEntity: (kind: EntityKind, id: string) => void;
  readonly onReactivateEntity: (kind: EntityKind, id: string) => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [tab, setTab] = useState<ProductTab>("products");

  return (
    <View style={styles.fill}>
      <SheetHeader title="จัดการสินค้า" onClose={onClose} />
      {state === null ? (
        <View style={styles.center}>
          <Text style={styles.loading}>กำลังอ่านรายการสินค้าจากระบบ…</Text>
        </View>
      ) : state.kind === "message" ? (
        <MessageBody message={state.message} onRetry={onRetry} onSignIn={onSignIn} />
      ) : (
        <>
          <View style={styles.tabs}>
            <Segmented options={TAB_OPTIONS} value={tab} onChange={setTab} />
          </View>
          {refusal !== null ? <Text style={styles.refusal}>{refusal}</Text> : null}
          {tab === "products" ? (
            <ProductsTab
              ready={state}
              busy={busy}
              onCreateProduct={onCreateProduct}
              onProductMenu={onProductMenu}
            />
          ) : (
            <EntityTab
              kind={tab === "categories" ? "category" : "unit"}
              entities={tab === "categories" ? state.categories : state.units}
              editable={state.editable}
              busy={busy}
              onCreate={onCreateEntity}
              onRename={onRenameEntity}
              onDeactivate={onDeactivateEntity}
              onReactivate={onReactivateEntity}
            />
          )}
        </>
      )}
    </View>
  );
}

function MessageBody({
  message,
  onRetry,
  onSignIn,
}: {
  message: ProductsMessage;
  onRetry: () => void;
  onSignIn: () => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Card>
        <View style={styles.msgBadge}>
          <Badge tone={MESSAGE_TONE[message.tone]}>{message.badge}</Badge>
        </View>
        {message.lines.map((line, i) => (
          <Text key={i} style={styles.msgLine}>
            {line}
          </Text>
        ))}
        {message.action !== null ? (
          <Button
            label={message.action.label}
            onPress={message.action.kind === "sign_in" ? onSignIn : onRetry}
            style={styles.msgBtn}
          />
        ) : null}
      </Card>
    </ScrollView>
  );
}

/* ------------------------------------------------------------ products tab -- */

function ProductsTab({
  ready,
  busy,
  onCreateProduct,
  onProductMenu,
}: {
  ready: Extract<ProductsScreenState, { kind: "ready" }>;
  busy: boolean;
  onCreateProduct: (body: ProductCreateBody) => void;
  onProductMenu: (product: AdminProduct) => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [filter, setFilter] = useState<ProductFilter>(NO_FILTER);
  const [adding, setAdding] = useState(false);

  const model = useMemo(
    () => productListModel(ready.products, ready.categories, filter),
    [ready.products, ready.categories, filter],
  );
  // Active categories are the only ones a new/edited product may file under (the
  // server refuses a retired one); the filter chips show every category.
  const activeCategories = useMemo(() => ready.categories.filter((c) => c.is_active), [ready.categories]);
  const activeUnits = useMemo(() => ready.units.filter((u) => u.is_active), [ready.units]);
  const byId = useMemo(() => new Map(ready.products.map((p) => [p.id, p])), [ready.products]);

  if (adding) {
    return (
      <ProductForm
        title="เพิ่มสินค้า"
        categories={activeCategories}
        units={activeUnits}
        busy={busy}
        showCode
        onCancel={() => setAdding(false)}
        onSubmit={(f) => {
          const v = checkNewProduct({
            code: f.code,
            name: f.name,
            categoryId: f.categoryId,
            uomId: f.uomId,
            existing: ready.products,
          });
          if (!v.ok) return v;
          onCreateProduct(v.body);
          setAdding(false);
          return { ok: true } as const;
        }}
      />
    );
  }

  const sections = model.sections.map((s) => ({ ...s, data: s.rows }));

  return (
    <View style={styles.fill}>
      <View style={styles.filterBar}>
        <Field
          placeholder="ค้นหา: ชื่อ / รหัสสินค้า"
          value={filter.query}
          onChangeText={(v) => setFilter({ ...filter, query: v })}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.searchField}
        />
        <Segmented
          options={ACTIVITY_OPTIONS}
          value={filter.activity}
          onChange={(v) => setFilter({ ...filter, activity: v })}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          keyboardShouldPersistTaps="handled"
        >
          <FilterChip
            label="ทุกหมวดหมู่"
            on={filter.categoryId === null}
            onPress={() => setFilter({ ...filter, categoryId: null })}
          />
          {ready.categories.map((c) => (
            <FilterChip
              key={c.id}
              label={c.name}
              on={filter.categoryId === c.id}
              onPress={() => setFilter({ ...filter, categoryId: c.id })}
            />
          ))}
        </ScrollView>
        {ready.editable ? (
          <Button label="เพิ่มสินค้า" icon="plus" onPress={() => setAdding(true)} style={styles.addProductBtn} />
        ) : null}
      </View>

      {model.matched === 0 ? (
        <EmptyState icon="products">{model.emptyLine ?? ""}</EmptyState>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          renderSectionHeader={({ section }) => <SectionHeading>{section.title}</SectionHeading>}
          renderItem={({ item }) => (
            <ProductRow
              row={item}
              editable={ready.editable}
              onPress={() => {
                const product = byId.get(item.id);
                if (product !== undefined) onProductMenu(product);
              }}
            />
          )}
        />
      )}
    </View>
  );
}

function ProductRow({
  row,
  editable,
  onPress,
}: {
  row: ProductListRow;
  editable: boolean;
  onPress: () => void;
}) {
  // A product with no price shows `ยังไม่ได้ตั้งราคา` in the price slot (row.priceLine),
  // the state that parks a bill; a priced one shows its tier count. Retired products
  // arrive under their own section heading (visibly apart), the users-screen shape.
  const interactive = editable ? { chevron: true, onPress } : { chevron: false };
  return (
    <Row
      label={row.name}
      value={row.priceLine}
      hint={`${row.code} · ${row.unitLabel}`}
      {...interactive}
    />
  );
}

/* ---------------------------------------------------------- the product form -- */

export interface ProductFormValue {
  code: string;
  name: string;
  categoryId: string | null;
  uomId: string | null;
}

/**
 * ADD or EDIT a product — code (add only; immutable), name, and a category and unit
 * picked from the shop's ACTIVE lists. Shared by the add mode here and the
 * ProductActionsSheet's edit. `onSubmit` returns the validation outcome so this
 * component can show the field error without owning the rule.
 */
export function ProductForm({
  title,
  initial,
  categories,
  units,
  busy,
  showCode,
  onCancel,
  onSubmit,
}: {
  title: string;
  initial?: ProductFormValue;
  categories: readonly AdminEntity[];
  units: readonly AdminEntity[];
  busy: boolean;
  showCode: boolean;
  onCancel: () => void;
  onSubmit: (v: ProductFormValue) => { ok: true } | { ok: false; field: string; message: string };
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(initial?.categoryId ?? null);
  const [uomId, setUomId] = useState<string | null>(initial?.uomId ?? null);
  const [error, setError] = useState<string | null>(null);

  const submit = (): void => {
    const r = onSubmit({ code, name, categoryId, uomId });
    if (!r.ok) setError(r.message);
    else setError(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <SectionHeading>{title}</SectionHeading>
      <Card>
        {showCode ? (
          <Field
            label="รหัสสินค้า"
            hint="รหัสอ้างอิงที่แก้ไม่ได้ภายหลัง — ใช้บนสลิปและบิลเก่า"
            value={code}
            onChangeText={(v) => {
              setCode(v);
              setError(null);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={PRODUCT_CODE_MAX_LENGTH}
            style={styles.field}
          />
        ) : initial !== undefined ? (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>รหัสสินค้า</Text>
            <Text style={styles.fixedCode}>{initial.code}</Text>
          </View>
        ) : null}
        <Field
          label="ชื่อสินค้า"
          value={name}
          onChangeText={(v) => {
            setName(v);
            setError(null);
          }}
          maxLength={PRODUCT_NAME_MAX_LENGTH}
          style={styles.field}
        />
        <Text style={styles.fieldLabel}>หมวดหมู่</Text>
        <ChipPicker
          options={categories}
          selected={categoryId}
          emptyLine="ยังไม่มีหมวดหมู่ที่ใช้งาน — เพิ่มที่แท็บ หมวดหมู่ ก่อน"
          onSelect={(id) => {
            setCategoryId(id);
            setError(null);
          }}
        />
        <Text style={styles.fieldLabel}>หน่วยนับ</Text>
        <ChipPicker
          options={units}
          selected={uomId}
          emptyLine="ยังไม่มีหน่วยนับที่ใช้งาน — เพิ่มที่แท็บ หน่วยนับ ก่อน"
          onSelect={(id) => {
            setUomId(id);
            setError(null);
          }}
        />
        {error !== null ? <Text style={styles.refusal}>{error}</Text> : null}
        <View style={styles.formActions}>
          <Button label="ยกเลิก" kind="secondary" onPress={onCancel} style={styles.formBtn} />
          <Button label="บันทึก" onPress={submit} busy={busy} style={styles.formBtn} />
        </View>
      </Card>
    </ScrollView>
  );
}

function ChipPicker({
  options,
  selected,
  emptyLine,
  onSelect,
}: {
  options: readonly AdminEntity[];
  selected: string | null;
  emptyLine: string;
  onSelect: (id: string) => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  if (options.length === 0) {
    return <Text style={styles.pickerEmpty}>{emptyLine}</Text>;
  }
  return (
    <View style={styles.pickerWrap}>
      {options.map((o) => {
        const on = o.id === selected;
        return (
          <Touchable
            key={o.id}
            haptic="light"
            onPress={() => onSelect(o.id)}
            accessibilityLabel={o.name}
            style={[styles.pickChip, on ? styles.pickChipOn : null]}
          >
            <Text style={[styles.pickChipText, on ? styles.pickChipTextOn : null]}>{o.name}</Text>
          </Touchable>
        );
      })}
    </View>
  );
}

function FilterChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <Touchable
      haptic="light"
      onPress={onPress}
      accessibilityLabel={label}
      style={[styles.filterChip, on ? styles.filterChipOn : null]}
    >
      <Text style={[styles.filterChipText, on ? styles.filterChipTextOn : null]}>{label}</Text>
    </Touchable>
  );
}

/* ----------------------------------------------------- categories / units -- */

/**
 * A CATEGORY or UNIT list, managed inline: the active rows, the retired rows apart,
 * an inline rename, a deactivate/reactivate, and an add form. Kept minimal — a
 * product cannot be created without a category and a unit, so this exists to make
 * them, not to grow into a second product screen.
 */
function EntityTab({
  kind,
  entities,
  editable,
  busy,
  onCreate,
  onRename,
  onDeactivate,
  onReactivate,
}: {
  kind: EntityKind;
  entities: readonly AdminEntity[];
  editable: boolean;
  busy: boolean;
  onCreate: (kind: EntityKind, body: EntityCreateBody) => void;
  onRename: (kind: EntityKind, id: string, name: string) => void;
  onDeactivate: (kind: EntityKind, id: string) => void;
  onReactivate: (kind: EntityKind, id: string) => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const model = useMemo(() => entityListModel(entities, editable), [entities, editable]);
  const word = kind === "category" ? "หมวดหมู่" : "หน่วยนับ";

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (): void => {
    const v = checkNewEntity({ code, name, kind, existing: entities });
    if (!v.ok) {
      setError(v.message);
      return;
    }
    onCreate(kind, v.body);
    setCode("");
    setName("");
    setError(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      {entities.length === 0 ? (
        <Text style={styles.entityEmpty}>{`ยังไม่มี${word}ในร้าน — เพิ่ม${word}แรกด้านล่าง`}</Text>
      ) : (
        <>
          {model.activeRows.length > 0 ? (
            <>
              <SectionHeading>{word}</SectionHeading>
              <GroupCard>
                {model.activeRows.map((row) => (
                  <EntityRowItem
                    key={row.id}
                    row={row}
                    kind={kind}
                    busy={busy}
                    onRename={onRename}
                    onDeactivate={onDeactivate}
                    onReactivate={onReactivate}
                  />
                ))}
              </GroupCard>
            </>
          ) : null}
          {model.inactiveRows.length > 0 ? (
            <>
              <SectionHeading>{`${word}ที่ปิดใช้งาน`}</SectionHeading>
              <GroupCard>
                {model.inactiveRows.map((row) => (
                  <EntityRowItem
                    key={row.id}
                    row={row}
                    kind={kind}
                    busy={busy}
                    onRename={onRename}
                    onDeactivate={onDeactivate}
                    onReactivate={onReactivate}
                  />
                ))}
              </GroupCard>
            </>
          ) : null}
        </>
      )}

      {editable ? (
        <>
          <SectionHeading>{`เพิ่ม${word}`}</SectionHeading>
          <Card>
            <Field
              label={`รหัส${word}`}
              value={code}
              onChangeText={(v) => {
                setCode(v);
                setError(null);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={PRODUCT_CODE_MAX_LENGTH}
              style={styles.field}
            />
            <Field
              label={`ชื่อ${word}`}
              value={name}
              onChangeText={(v) => {
                setName(v);
                setError(null);
              }}
              maxLength={PRODUCT_NAME_MAX_LENGTH}
              style={styles.field}
            />
            {error !== null ? <Text style={styles.refusal}>{error}</Text> : null}
            <Button label={`เพิ่ม${word}`} icon="plus" onPress={submit} busy={busy} style={styles.addBtn} />
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

function EntityRowItem({
  row,
  kind,
  busy,
  onRename,
  onDeactivate,
  onReactivate,
}: {
  row: EntityRow;
  kind: EntityKind;
  busy: boolean;
  onRename: (kind: EntityKind, id: string, name: string) => void;
  onDeactivate: (kind: EntityKind, id: string) => void;
  onReactivate: (kind: EntityKind, id: string) => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(row.name);
  const [error, setError] = useState<string | null>(null);

  const submitRename = (): void => {
    const v = checkRenameEntity(name, kind);
    if (!v.ok) {
      setError(v.message);
      return;
    }
    onRename(kind, row.id, v.name);
    setRenaming(false);
    setError(null);
  };

  return (
    <View style={styles.entityRow}>
      {renaming ? (
        <View style={styles.entityRenameWrap}>
          <Field
            value={name}
            onChangeText={(v) => {
              setName(v);
              setError(null);
            }}
            autoFocus
            maxLength={PRODUCT_NAME_MAX_LENGTH}
            style={styles.entityRenameField}
          />
          {error !== null ? <Text style={styles.entityRenameError}>{error}</Text> : null}
          <View style={styles.entityRenameActions}>
            <Button
              label="ยกเลิก"
              kind="secondary"
              onPress={() => {
                setName(row.name);
                setRenaming(false);
                setError(null);
              }}
              style={styles.entityRenameBtn}
            />
            <Button label="บันทึก" onPress={submitRename} busy={busy} style={styles.entityRenameBtn} />
          </View>
        </View>
      ) : (
        <View style={styles.entityRowMain}>
          <View style={styles.entityRowLabel}>
            <Text style={styles.entityName}>{row.name}</Text>
            <Text style={styles.entityCode}>{row.code}</Text>
          </View>
          <View style={styles.entityRowActions}>
            <Touchable
              onPress={() => setRenaming(true)}
              disabled={busy}
              accessibilityLabel={`แก้ชื่อ ${row.name}`}
              style={styles.entityAction}
            >
              <Text style={styles.entityActionText}>แก้ชื่อ</Text>
            </Touchable>
            {row.mayDeactivate ? (
              <Touchable
                onPress={() => onDeactivate(kind, row.id)}
                disabled={busy}
                haptic="medium"
                accessibilityLabel={`ปิดใช้งาน ${row.name}`}
                style={styles.entityAction}
              >
                <Text style={styles.entityActionDanger}>ปิด</Text>
              </Touchable>
            ) : row.mayReactivate ? (
              <Touchable
                onPress={() => onReactivate(kind, row.id)}
                disabled={busy}
                accessibilityLabel={`เปิดใช้งาน ${row.name}`}
                style={styles.entityAction}
              >
                <Text style={styles.entityActionText}>เปิด</Text>
              </Touchable>
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.color.background },
    body: { padding: t.layout.screenPad, paddingBottom: t.layout.scrollGutter },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: t.space.lg },
    loading: { fontSize: t.type.bodyLg, color: t.color.textMuted },
    tabs: { paddingHorizontal: t.layout.screenPad, paddingTop: t.space.md },
    refusal: {
      fontSize: t.type.body,
      fontWeight: "800",
      color: t.color.danger,
      paddingHorizontal: t.layout.screenPad,
      marginTop: t.space.md,
    },
    filterBar: {
      paddingHorizontal: t.layout.screenPad,
      paddingTop: t.space.md,
      gap: t.space.md,
    },
    searchField: {},
    chipRow: { gap: t.space.sm, paddingVertical: t.space.xs },
    filterChip: {
      minHeight: t.tapMin,
      justifyContent: "center",
      paddingHorizontal: t.space.xl,
      borderRadius: t.radius.pill,
      borderWidth: 1,
      borderColor: t.color.border,
      backgroundColor: t.color.surfaceAlt,
    },
    filterChipOn: { backgroundColor: t.color.primaryFill, borderColor: t.color.primary },
    filterChipText: { fontSize: t.type.body, fontWeight: "700", color: t.color.textMuted },
    filterChipTextOn: { color: t.color.onPrimaryFill },
    addProductBtn: {},
    listContent: { padding: t.layout.screenPad, paddingBottom: t.layout.scrollGutter },
    field: { marginBottom: t.space.lg },
    fieldLabel: {
      fontSize: t.type.body,
      fontWeight: "600",
      color: t.color.textSubtle,
      marginBottom: t.space.sm,
      marginHorizontal: t.space.xs,
    },
    fixedCode: { fontSize: t.type.subhead, fontWeight: "700", color: t.color.textMuted, marginBottom: t.space.lg },
    pickerWrap: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm, marginBottom: t.space.lg },
    pickerEmpty: { fontSize: t.type.body, color: t.color.warning, marginBottom: t.space.lg, lineHeight: 20 },
    pickChip: {
      minHeight: t.tapMin,
      justifyContent: "center",
      paddingHorizontal: t.space.xl,
      borderRadius: t.radius.pill,
      borderWidth: 1,
      borderColor: t.color.border,
      backgroundColor: t.color.surfaceAlt,
    },
    pickChipOn: { backgroundColor: t.color.primaryFill, borderColor: t.color.primary },
    pickChipText: { fontSize: t.type.bodyLg, fontWeight: "700", color: t.color.textMuted },
    pickChipTextOn: { color: t.color.onPrimaryFill },
    formActions: { flexDirection: "row", gap: t.space.lg, marginTop: t.space.md },
    formBtn: { flex: 1 },
    addBtn: { marginTop: t.space.lg },
    entityEmpty: { fontSize: t.type.bodyLg, color: t.color.textMuted, lineHeight: 22, marginBottom: t.space.lg },
    entityRow: { paddingHorizontal: t.layout.cardPad, paddingVertical: t.space.md },
    entityRowMain: { flexDirection: "row", alignItems: "center", gap: t.space.md, minHeight: t.tapMin },
    entityRowLabel: { flex: 1 },
    entityName: { fontSize: t.type.bodyLg, fontWeight: "600", color: t.color.text },
    entityCode: { fontSize: t.type.body, color: t.color.textSubtle, marginTop: t.space.xs },
    entityRowActions: { flexDirection: "row", gap: t.space.sm },
    entityAction: {
      minHeight: t.tapMin,
      justifyContent: "center",
      paddingHorizontal: t.space.lg,
      borderRadius: t.radius.sm,
    },
    entityActionText: { fontSize: t.type.bodyLg, fontWeight: "700", color: t.color.primary },
    entityActionDanger: { fontSize: t.type.bodyLg, fontWeight: "700", color: t.color.danger },
    entityRenameWrap: { gap: t.space.md },
    entityRenameField: {},
    entityRenameError: { fontSize: t.type.body, fontWeight: "800", color: t.color.danger },
    entityRenameActions: { flexDirection: "row", gap: t.space.lg },
    entityRenameBtn: { flex: 1 },
    msgBadge: { alignItems: "flex-start", marginBottom: t.space.md },
    msgLine: { fontSize: t.type.bodyLg, color: t.color.text, lineHeight: 22, marginTop: t.space.sm },
    msgBtn: { marginTop: t.space.xl },
  });
}
