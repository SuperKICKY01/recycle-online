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
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { SignOutAction, SignOutCard } from "../src/session/signOutNotice";

interface Props {
  visible: boolean;
  card: SignOutCard;
  busy: boolean;
  onAction: (action: SignOutAction) => void;
}

const TONE_COLOR: Record<SignOutCard["tone"], string> = {
  ask: "#0f172a",
  warn: "#b45309",
  bad: "#b91c1c",
};

export function SignOutSheet({ visible, card, busy, onAction }: Props) {
  const dismiss = card.actions.find((a) => a.kind === "dismiss");
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android's back gesture must land on the same handler as the button, not
      // on a silent close that leaves the caller believing the sheet is open.
      onRequestClose={() => {
        if (dismiss) onAction(dismiss);
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={[styles.title, { color: TONE_COLOR[card.tone] }]}>{card.title}</Text>

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
                <Text
                  style={action.kind === "dismiss" ? styles.cancelText : styles.confirmText}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.6)",
    justifyContent: "center",
    padding: 20,
  },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20, maxHeight: "88%" },
  title: { fontSize: 20, fontWeight: "900", marginBottom: 4 },
  scroll: { marginTop: 8 },
  line: { fontSize: 15, fontWeight: "600", color: "#334155", marginTop: 10, lineHeight: 22 },
  buttons: { flexDirection: "row", gap: 12, marginTop: 20 },
  btn: { flex: 1, minHeight: 56, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cancel: { backgroundColor: "#e2e8f0" },
  confirm: { backgroundColor: "#0f172a" },
  cancelText: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  confirmText: { fontSize: 16, fontWeight: "800", color: "#fff" },
  dim: { opacity: 0.5 },
});
