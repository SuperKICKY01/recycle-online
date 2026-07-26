/**
 * Always-visible status strip: connection, bills waiting, last successful sync.
 *
 * Everything here is stated in plain Thai with no jargon — no "sync", no
 * "queue", no state names. The operator needs one glance to answer "is anything
 * wrong", so a problem is a colour change plus a sentence, never an icon that
 * has to be learned.
 *
 * HONEST LIMIT, worth knowing before trusting the dot: `online` is derived from
 * the outcome of the last real send attempt, not from a network API. With
 * nothing waiting to send there is nothing to learn from, so the strip says
 * "พร้อมใช้งาน" (ready) rather than claiming a connection it has not tested.
 * Adding a reachability probe would be a new feature and is out of scope here.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";

export interface SyncStatus {
  /** null = not attempted since launch, so unknown rather than assumed good. */
  online: boolean | null;
  pending: number;
  failed: number;
  lastSyncedAt: string | null;
  /**
   * Set ONLY when one bill is POISONED — the reachable server keeps refusing the
   * head past the alarm threshold, holding up the bills behind it. Null the rest
   * of the time, INCLUDING a plain offline backlog however large (that stays the
   * calm amber "ออฟไลน์" message below — you wait it out; this you call support
   * for). This outranks every other message: a poisoned queue silently loses the
   * shop the ability to sync while staff keep saving into the backlog unaware.
   * `forMs` is how long the reachable server has been refusing it, `attempts`
   * how many times in a row it has refused. Both are reported because either one
   * can be what raised the alarm, and "refused 5 times" is the more legible
   * reason when the elapsed time is still under a minute.
   */
  blocked: { behind: number; forMs: number; attempts: number } | null;
  /**
   * Bills parked because the server said master data is missing (no price for
   * this grade). A DIFFERENT problem from every other state here: the network is
   * fine, the bill is fine, and waiting will not fix it — someone must set the
   * price in the back office. So it gets its own message and its own action,
   * never the amber "we'll send it later" wording, which would be a lie.
   */
  waitingOnMasterData: number;
  onRetryMasterData: () => void;
}

const hhmm = (iso: string): string => {
  const d = new Date(iso);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

interface Tone {
  bg: string;
  fg: string;
  dot: string;
}

const TONES: Record<"bad" | "warn" | "busy" | "good" | "idle", Tone> = {
  bad: { bg: "#fee2e2", fg: "#7f1d1d", dot: "#b91c1c" },
  warn: { bg: "#fef3c7", fg: "#78350f", dot: "#b45309" },
  busy: { bg: "#dbeafe", fg: "#1e3a8a", dot: "#1d4ed8" },
  good: { bg: "#dcfce7", fg: "#14532d", dot: "#15803d" },
  idle: { bg: "#f1f5f9", fg: "#334155", dot: "#64748b" },
};

export function StatusStrip({
  online,
  pending,
  failed,
  lastSyncedAt,
  blocked,
  waitingOnMasterData,
  onRetryMasterData,
}: SyncStatus) {
  let tone = TONES.idle;
  let message: string;
  let action: string | null = null;

  if (blocked !== null) {
    // A bill the REACHABLE server keeps refusing is damming every bill behind
    // it. Say exactly that — including "even though the server is reachable", so
    // staff know this is not "wait for signal" but "call support" — with how
    // long and how many, no jargon, visible without opening anything.
    tone = TONES.bad;
    // Report the REFUSAL COUNT, not just elapsed minutes. The alarm can now be
    // raised by the count alone, and in that case the elapsed time may still be
    // well under a minute — rounding it up to "1 นาที" would understate a bill
    // the server has already refused five times.
    const mins = Math.round(blocked.forMs / 60_000);
    const howLong = mins >= 1 ? ` นาน ${String(mins)} นาที` : "";
    message =
      `บิล 1 ใบส่งไม่ผ่าน ${String(blocked.attempts)} ครั้งติด${howLong}` +
      ` ทั้งที่เชื่อมต่อเซิร์ฟเวอร์ได้` +
      ` — ค้างหน้าคิวจนอีก ${String(blocked.behind)} ใบส่งไม่ได้ ต้องติดต่อฝ่ายสนับสนุน`;
  } else if (waitingOnMasterData > 0) {
    // Ranked above `failed` on purpose: this one is time-sensitive and cheap to
    // fix. Staff are often still at the yard, and the office can add the price in
    // seconds — whereas a malformed bill needs someone to sit down and correct
    // it. Say what to do, not what went wrong.
    tone = TONES.warn;
    message =
      `${String(waitingOnMasterData)} ใบรอราคาสินค้า — ยังไม่ได้ตั้งราคาสำหรับเกรดของผู้ขายรายนี้` +
      ` บิลถูกเก็บไว้ครบ ให้สำนักงานตั้งราคาแล้วกดส่งอีกครั้ง`;
    action = "ส่งอีกครั้ง";
  } else if (failed > 0) {
    tone = TONES.bad;
    message = `ส่งไม่สำเร็จ ${String(failed)} ใบ — ต้องแก้ไข`;
  } else if (online === false) {
    tone = TONES.warn;
    message =
      pending > 0
        ? `ออฟไลน์ — เก็บไว้ในเครื่อง ${String(pending)} ใบ จะส่งให้เองเมื่อเน็ตกลับมา`
        : "ออฟไลน์ — บันทึกได้ตามปกติ";
  } else if (pending > 0) {
    tone = TONES.busy;
    message = `กำลังส่ง ${String(pending)} ใบ`;
  } else if (online === true) {
    tone = TONES.good;
    message = "ส่งครบแล้ว";
  } else {
    message = "พร้อมใช้งาน";
  }

  return (
    <View style={[styles.strip, { backgroundColor: tone.bg }]}>
      <View style={[styles.dot, { backgroundColor: tone.dot }]} />
      <Text style={[styles.text, { color: tone.fg }]} numberOfLines={3}>
        {message}
      </Text>
      {action !== null ? (
        <Pressable style={styles.action} onPress={onRetryMasterData}>
          <Text style={styles.actionText}>{action}</Text>
        </Pressable>
      ) : null}
      {lastSyncedAt !== null && action === null ? (
        <Text style={[styles.time, { color: tone.fg }]}>ส่งล่าสุด {hhmm(lastSyncedAt)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 14,
    paddingVertical: 8, gap: 8,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  text: { flex: 1, fontSize: 13, fontWeight: "800" },
  time: { fontSize: 12, fontWeight: "700", opacity: 0.85 },
  action: {
    minHeight: 36, paddingHorizontal: 12, justifyContent: "center",
    borderRadius: 8, backgroundColor: "#0f766e",
  },
  actionText: { color: "#fff", fontSize: 13, fontWeight: "800" },
});
