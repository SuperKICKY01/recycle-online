/**
 * Always-visible status strip: connection, bills waiting, last successful sync.
 *
 * Everything here is stated in plain Thai with no jargon — no "sync", no
 * "queue", no state names. The operator needs one glance to answer "is anything
 * wrong", so a problem is a colour change plus a sentence, never an icon that
 * has to be learned.
 *
 * THIS FILE NO LONGER DECIDES WHAT THE STRIP SAYS. The ordered branch that used
 * to live here is sync/statusNotice.ts, for one reason: app/ is unreachable by
 * the headless proofs, so while the wording lived here it could not be asserted
 * on — and an expired session was displayed as ออฟไลน์ with every proof green,
 * because none of them could see this file. Same move, same reason, as
 * billNotice for the bill card. What is left here is presentation.
 *
 * HONEST LIMIT, worth knowing before trusting the dot: `online` is derived from
 * the outcome of the last real send attempt, not from a network API. With
 * nothing waiting to send there is nothing to learn from, so the strip says
 * "พร้อมใช้งาน" (ready) rather than claiming a connection it has not tested.
 * Adding a reachability probe would be a new feature and is out of scope here.
 */
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { statusNotice } from "../src/sync/statusNotice";
import type { StatusInput, StatusTone } from "../src/sync/statusNotice";
import { shopTime } from "@recycle/shop-time";
import { useTheme, type ThemeTokens } from "./theme";

export interface StatusStripProps extends StatusInput {
  lastSyncedAt: string | null;
  /** The office has added the missing price; release every parked bill now. */
  onRetryMasterData: () => void;
  /**
   * Sign in again. Reachable from HERE and not only from the app's login screen,
   * because that screen renders on `token === null` — which is exactly false
   * when a token has EXPIRED, so an operator whose session ran out had no button
   * to press anywhere on the device.
   *
   * This matters MORE since Phase 2c-8, not less: a restored token is treated as
   * usable until a server says otherwise, so the ordinary way an expiry now
   * surfaces is mid-shift on this strip, with the login screen never shown at
   * all.
   */
  onSignIn: () => void;
}

interface Tone {
  bg: string;
  fg: string;
  dot: string;
}

function makeTones(t: ThemeTokens): Record<StatusTone, Tone> {
  return {
    bad: { bg: t.color.dangerBg, fg: t.color.dangerFg, dot: t.color.danger },
    warn: { bg: t.color.warningBg, fg: t.color.warningFg, dot: t.color.warning },
    busy: { bg: t.color.busyBg, fg: t.color.busyFg, dot: t.color.infoStrong },
    good: { bg: t.color.successBg, fg: t.color.successFg, dot: t.color.success },
    idle: { bg: t.color.neutralBg, fg: t.color.neutralFg, dot: t.color.textSubtle },
  };
}

export function StatusStrip(props: StatusStripProps) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { lastSyncedAt, onRetryMasterData, onSignIn, ...input } = props;
  const notice = statusNotice(input);
  const tone = makeTones(t)[notice.tone];
  // The action's KIND picks the handler. The view never chooses a label — that
  // arrives with the kind, so "ส่งอีกครั้ง" cannot end up wired to the sign-in.
  const onPress = notice.action?.kind === "sign_in" ? onSignIn : onRetryMasterData;

  return (
    <View style={[styles.strip, { backgroundColor: tone.bg }]}>
      <View style={[styles.dot, { backgroundColor: tone.dot }]} />
      <Text style={[styles.text, { color: tone.fg }]} numberOfLines={3}>
        {notice.message}
      </Text>
      {notice.action !== null ? (
        <Pressable style={styles.action} onPress={onPress}>
          <Text style={styles.actionText}>{notice.action.label}</Text>
        </Pressable>
      ) : null}
      {/*
        shopTime, not a local getHours()/getMinutes() pair. That happened to be
        RIGHT on a phone set to Bangkok and silently wrong on one that is not, so
        it is routed through the same helper as the bill list: one code path, and
        the answer no longer depends on the handset.

        A CLOCK ONLY, no date — so the พ.ศ. change does not reach this line;
        there is no year here to be in the wrong era. Known limit, unchanged by
        that work: a sync from yesterday still reads as a bare time. Adding a
        date here means deciding what "ส่งล่าสุด เมื่อวาน" should say, which is
        a wording change, not a formatting one.
      */}
      {lastSyncedAt !== null && notice.action === null ? (
        <Text style={[styles.time, { color: tone.fg }]}>ส่งล่าสุด {shopTime(lastSyncedAt)}</Text>
      ) : null}
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    strip: {
      flexDirection: "row", alignItems: "center", paddingHorizontal: t.space.xxl,
      paddingVertical: t.space.md, gap: t.space.md,
    },
    // A 12px decorative dot; its radius is half its size, so both stay literal.
    dot: { width: 12, height: 12, borderRadius: 6 },
    text: { flex: 1, fontSize: t.type.body, fontWeight: "800" },
    time: { fontSize: t.type.body, fontWeight: "700", opacity: 0.85 },
    action: {
      minHeight: t.tapMin, paddingHorizontal: t.space.xl, justifyContent: "center",
      borderRadius: t.radius.md, backgroundColor: t.color.primary,
    },
    actionText: { color: t.color.onPrimary, fontSize: t.type.body, fontWeight: "800" },
  });
}
