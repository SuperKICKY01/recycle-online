/**
 * THE PRODUCT ROW'S ACTIONS MENU — edit (name / category / unit) and
 * deactivate / reactivate (P1.15). The row on ProductsScreen opens this, the same
 * grab-handle leaf as UserActionsSheet and TierActionsSheet, rendered inside the ONE
 * SheetHost (no second Modal — prove:sheets reddens if one appears). WHICH product
 * it acts on is App.tsx payload (`productMenuTarget`), written WITH the open.
 *
 * WHAT THE SHEET DECIDES vs WHAT IT DOES NOT. It owns the mode (menu / editing /
 * confirm) and the edit BUFFERS (through the shared ProductForm). It decides nothing
 * about the rule: `checkEditProduct` is productsAdmin's, and the server refuses
 * regardless (`require_admin`, and the duplicate/ref validation).
 *
 * THE CODE IS NOT EDITED HERE. It is immutable — set once at create, and shown
 * read-only — because it is what a printed slip and a historical bill read; a wrong
 * code is fixed by a new product with the old one retired, never a rename (server
 * ProductUpdate's note). DEACTIVATE carries a confirmation naming its one real
 * consequence: new bills against this product are refused (resolvably), while every
 * OLD bill still reads it unchanged.
 */
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  checkEditProduct,
  type AdminEntity,
  type AdminProduct,
  type ProductPatchBody,
} from "../src/products/productsAdmin";
import { ProductForm } from "./ProductsScreen";
import { useTheme, type ThemeTokens } from "./theme";
import { Touchable } from "./Press";

const DEACTIVATE_CONSEQUENCE =
  "การปิดสินค้าจะทำให้สร้างบิลใหม่ด้วยสินค้านี้ไม่ได้ — บิลเก่าที่มีสินค้านี้ไม่กระทบ และเปิดใช้งานใหม่ได้ภายหลัง";

export function ProductActionsSheet({
  product,
  categories,
  units,
  busy,
  onEdit,
  onDeactivate,
  onReactivate,
  onClose,
}: {
  /** The product the row was tapped on. App.tsx writes this WITH the open. */
  readonly product: AdminProduct;
  /** The shop's ACTIVE categories and units — the only ones the edit may file under. */
  readonly categories: readonly AdminEntity[];
  readonly units: readonly AdminEntity[];
  readonly busy: boolean;
  readonly onEdit: (id: string, body: ProductPatchBody) => void;
  readonly onDeactivate: (id: string) => void;
  readonly onReactivate: (id: string) => void;
  readonly onClose: () => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [mode, setMode] = useState<"menu" | "editing" | "confirmDeactivate">("menu");

  if (mode === "editing") {
    return (
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ProductForm
            title={`แก้ไข ${product.name}`}
            initial={{
              code: product.code,
              name: product.name,
              categoryId: product.category_id,
              uomId: product.uom_id,
            }}
            categories={categories}
            units={units}
            busy={busy}
            showCode={false}
            onCancel={() => setMode("menu")}
            onSubmit={(f) => {
              const v = checkEditProduct({ name: f.name, categoryId: f.categoryId, uomId: f.uomId });
              if (!v.ok) return v;
              onEdit(product.id, v.body);
              return { ok: true } as const;
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.backdrop}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {product.name}
          </Text>
          <Text style={styles.sub}>
            {`${product.code} · ${product.uom_name}${product.is_active ? "" : " · ปิดใช้งาน"}`}
          </Text>

          {mode === "confirmDeactivate" ? (
            <>
              <Text style={styles.note}>{DEACTIVATE_CONSEQUENCE}</Text>
              <Touchable
                style={styles.action}
                disabled={busy}
                haptic="medium"
                accessibilityLabel="ยืนยันปิดสินค้า"
                onPress={() => onDeactivate(product.id)}
              >
                <Text style={styles.actionDanger}>ยืนยันปิดสินค้า</Text>
              </Touchable>
            </>
          ) : (
            <>
              <Touchable
                style={styles.action}
                disabled={busy}
                onPress={() => setMode("editing")}
                accessibilityLabel="แก้ไขสินค้า"
              >
                <Text style={styles.actionText}>แก้ไขสินค้า</Text>
              </Touchable>
              {product.is_active ? (
                <Touchable
                  style={styles.action}
                  disabled={busy}
                  onPress={() => setMode("confirmDeactivate")}
                  accessibilityLabel="ปิดสินค้า"
                >
                  <Text style={styles.actionDanger}>ปิดสินค้า</Text>
                </Touchable>
              ) : (
                <Touchable
                  style={styles.action}
                  disabled={busy}
                  onPress={() => onReactivate(product.id)}
                  accessibilityLabel="เปิดใช้งานอีกครั้ง"
                >
                  <Text style={styles.actionText}>เปิดใช้งานอีกครั้ง</Text>
                </Touchable>
              )}
            </>
          )}

          <Touchable style={styles.action} onPress={onClose} accessibilityLabel="ยกเลิก">
            <Text style={styles.actionText}>ยกเลิก</Text>
          </Touchable>
        </View>
      </View>
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: t.color.overlay },
    scrim: { ...StyleSheet.absoluteFillObject },
    sheet: {
      backgroundColor: t.color.background,
      borderTopLeftRadius: t.radius.card,
      borderTopRightRadius: t.radius.card,
      paddingTop: t.space.md,
      paddingBottom: t.layout.scrollGutter,
      maxHeight: "88%",
    },
    handle: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: t.radius.sm,
      backgroundColor: t.color.border,
      marginBottom: t.space.md,
    },
    body: { paddingHorizontal: t.layout.screenPad, gap: t.space.md },
    title: { fontSize: t.type.subhead, fontWeight: "900", color: t.color.text },
    sub: { fontSize: t.type.body, fontWeight: "700", color: t.color.textSubtle },
    note: { fontSize: t.type.body, color: t.color.textMuted, lineHeight: 20 },
    action: {
      minHeight: t.tapMin,
      borderRadius: t.radius.lg,
      backgroundColor: t.color.surface,
      borderWidth: 1,
      borderColor: t.color.borderSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    actionText: { fontSize: t.type.subhead, fontWeight: "800", color: t.color.text },
    actionDanger: { fontSize: t.type.subhead, fontWeight: "800", color: t.color.danger },
  });
}
