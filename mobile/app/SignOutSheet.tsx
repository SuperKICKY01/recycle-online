/**
 * The sign-out sheet. PRESENTATION ONLY — it decides nothing.
 *
 * Every sentence, every button label and the ORDER they appear in comes from
 * src/session/signOutNotice.ts. This file adds no text of its own, which is the
 * whole reason the proof can claim to read what the operator reads: `card.lines`
 * is mapped in order and nothing is inserted between the items, so joining that
 * array in a proof is faithful by construction rather than by a convention
 * somebody has to remember.
 *
 * If you find yourself adding a `<Text>` here with words in it, it belongs in
 * signOutNotice.ts instead — that is the mistake
 * lessons/403-is-about-what-the-caller-may-do.md is about: one card, two
 * renderers, each internally correct, contradicting each other on screen.
 */
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { SignOutAction, SignOutCard } from "../src/session/signOutNotice";
import { useTheme, type ThemeTokens } from "./theme";

/**
 * NO MODAL ELEMENT AND NO `visible` PROP. This app has one Modal — app/SheetHost
 * — and the sheet stack decides which sheet is inside it. A second one anywhere
 * reintroduces the presentation defect SheetHost's header describes, and
 * `npm run prove:sheets` goes red the moment one appears in this directory.
 */
interface Props {
  card: SignOutCard;
  busy: boolean;
  onAction: (action: SignOutAction) => void;
}

function makeToneColor(t: ThemeTokens): Record<SignOutCard["tone"], string> {
  return {
    ask: t.color.text,
    warn: t.color.warning,
    bad: t.color.danger,
  };
}

export function SignOutSheet({ card, busy, onAction }: Props) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const toneColor = makeToneColor(t);
  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Text style={[styles.title, { color: toneColor[card.tone] }]}>{card.title}</Text>

        <ScrollView style={styles.scroll}>
          {card.lines.map((line, i) => (
            // Index keys: the list is a fixed, ordered rendering of one value,
            // never reordered or filtered in place.
            <Text key={i} style={styles.line}>
              {line}
            </Text>
          ))}
        </ScrollView>

        <View style={styles.buttons}>
          {card.actions.map((action) => (
            <Pressable
              key={action.kind}
              style={[
                styles.btn,
                action.kind === "dismiss" ? styles.cancel : styles.confirm,
                busy && styles.dim,
              ]}
              disabled={busy}
              onPress={() => onAction(action)}
            >
              <Text style={action.kind === "dismiss" ? styles.cancelText : styles.confirmText}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: t.color.overlay,
      justifyContent: "center",
      padding: t.space.x4,
    },
    card: { backgroundColor: t.color.surface, borderRadius: 16, padding: t.space.x4, maxHeight: "88%" },
    title: { fontSize: t.type.title, fontWeight: "900", marginBottom: t.space.xs },
    scroll: { marginTop: t.space.md },
    line: { fontSize: t.type.bodyLg, fontWeight: "600", color: t.color.neutralFg, marginTop: t.space.lg, lineHeight: 22 },
    buttons: { flexDirection: "row", gap: t.space.xl, marginTop: t.space.x4 },
    btn: { flex: 1, minHeight: t.tapMin, borderRadius: t.radius.xl, alignItems: "center", justifyContent: "center" },
    cancel: { backgroundColor: t.color.borderSoft },
    confirm: { backgroundColor: t.color.text },
    cancelText: { fontSize: t.type.subhead, fontWeight: "800", color: t.color.text },
    confirmText: { fontSize: t.type.subhead, fontWeight: "800", color: t.color.onPrimary },
    dim: { opacity: 0.5 },
  });
}
