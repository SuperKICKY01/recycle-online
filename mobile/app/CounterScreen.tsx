/**
 * THE CASHIER COUNTER — the unpaid queue and the payment form (STRUCTURE.md 2.1,
 * commit 2). Reached from a header entry gated on payments.record AND a branch whose
 * separate_cashier is not known-off (mayShowCounterEntry, src/counter/counterView.ts).
 *
 * PRESENTATION ONLY. Every sentence, gate, refusal, label and every satang of
 * arithmetic comes from src/counter/counterView.ts, where a headless proof reaches
 * them; this file owns only the pay-panel SELECTION (which seller, which method) and
 * renders what the model returns. Money is a server string shown byte-for-byte
 * through the model's display() renderings — this file never does money math.
 *
 * TWO STEPS, FEW TAPS: the queue is a glance (who / how much / how long waited); a
 * seller's "รับชำระเงิน" opens the pay panel, which shows what WILL leave the drawer
 * and to whom BEFORE it commits, then confirms. Online-only: an unreachable read is
 * a calm amber message, and the queue refreshes when the line returns.
 */
import { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  checkPayment,
  defaultDraft,
  METHOD_LABEL,
  OFFERED_METHODS,
  PARTIAL_NOTE,
  type CounterMessage,
  type CounterScreenState,
  type PaymentMethod,
  type PaymentPlan,
  type QueueSeller,
} from "../src/counter/counterView";
import { Badge, Button, Card, Figure, GroupCard, Row, SectionHeading, Segmented, type Tone } from "./Kit";
import { SheetHeader } from "./SheetHeader";
import { useTheme, type ThemeTokens } from "./theme";

const MESSAGE_TONE: Record<CounterMessage["tone"], Tone> = {
  offline: "warning",
  session: "info",
  error: "danger",
};

const METHOD_OPTIONS: readonly { value: PaymentMethod; label: string }[] = OFFERED_METHODS.map((m) => ({
  value: m,
  label: METHOD_LABEL[m],
}));

export function CounterScreen({
  state,
  refusal,
  busy,
  onClose,
  onRetry,
  onSignIn,
  onPay,
}: {
  /** The queue or a message, or null while the first read is in flight. */
  readonly state: CounterScreenState | null;
  /** The last payment's refusal, worded by counterView, or null. */
  readonly refusal: string | null;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onRetry: () => void;
  readonly onSignIn: () => void;
  /** The app mints the id/key/stamp, POSTs the payment, and re-reads the queue. */
  readonly onPay: (plan: PaymentPlan) => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.fill}>
      <SheetHeader title="รับชำระเงิน" onClose={onClose} />
      {state === null ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.loading}>กำลังอ่านบิลค้างจ่ายจากระบบ…</Text>
        </View>
      ) : state.kind === "message" ? (
        <MessageBody message={state.message} onRetry={onRetry} onSignIn={onSignIn} />
      ) : (
        <QueueBody queue={state.queue} refusal={refusal} busy={busy} onPay={onPay} />
      )}
    </View>
  );
}

function MessageBody({
  message,
  onRetry,
  onSignIn,
}: {
  message: CounterMessage;
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

function QueueBody({
  queue,
  refusal,
  busy,
  onPay,
}: {
  queue: Extract<CounterScreenState, { kind: "queue" }>["queue"];
  refusal: string | null;
  busy: boolean;
  onPay: (plan: PaymentPlan) => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  // The pay panel selection: which seller is being paid, or null (showing the list).
  const [paying, setPaying] = useState<QueueSeller | null>(null);

  if (paying !== null) {
    return (
      <PayPanel
        seller={paying}
        refusal={refusal}
        busy={busy}
        onBack={() => setPaying(null)}
        onPay={onPay}
      />
    );
  }

  if (queue.isEmpty) {
    return (
      <ScrollView contentContainerStyle={styles.body}>
        {refusal !== null ? <Text style={styles.refusal}>{refusal}</Text> : null}
        <Card>
          <Text style={styles.empty}>ไม่มีบิลค้างจ่าย</Text>
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.body}>
      {refusal !== null ? <Text style={styles.refusal}>{refusal}</Text> : null}
      {queue.sellers.map((seller) => (
        <View key={seller.seller_id} style={styles.sellerBlock}>
          <SectionHeading>{seller.name}</SectionHeading>
          <Card>
            <Figure label={queue.outstandingLabel} value={seller.outstandingDisplay} unit="บาท" hero />
            <GroupCard>
              {seller.bills.map((b) => (
                <Row
                  key={b.id}
                  label={b.doc_no ?? "บิลใหม่ (ยังไม่มีเลขที่)"}
                  value={b.remainingDisplay + " บาท"}
                  {...(b.partial ? { hint: PARTIAL_NOTE + " · จ่ายแล้ว " + b.paidDisplay } : {})}
                />
              ))}
            </GroupCard>
            <Button
              label={"รับชำระเงิน " + seller.outstandingDisplay + " บาท"}
              icon="check"
              onPress={() => setPaying(seller)}
              style={styles.payBtn}
            />
          </Card>
        </View>
      ))}
    </ScrollView>
  );
}

/**
 * The pay panel: pay this seller's unpaid bills in full, choose the method, confirm.
 * The plan is computed by checkPayment (the pure model) so the panel SHOWS what will
 * be paid — the total and the per-bill breakdown — before onPay commits it.
 */
function PayPanel({
  seller,
  refusal,
  busy,
  onBack,
  onPay,
}: {
  seller: QueueSeller;
  refusal: string | null;
  busy: boolean;
  onBack: () => void;
  onPay: (plan: PaymentPlan) => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [method, setMethod] = useState<PaymentMethod>("cash");

  // Pay every unpaid bill its full remaining — the yard's common case (multi-bill).
  const draft = defaultDraft(
    seller.seller_id,
    method,
    seller.bills.map((b) => ({ id: b.id, remaining: b.remaining })),
  );
  const check = checkPayment(draft);

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Button label="‹ กลับไปที่รายการ" kind="ghost" onPress={onBack} style={styles.backBtn} />
      <SectionHeading>{"จ่ายให้ " + seller.name}</SectionHeading>
      <Card>
        {check.ok ? (
          <Figure label="ยอดที่จะจ่าย" value={check.plan.amountDisplay} unit="บาท" hero />
        ) : null}
        <GroupCard>
          {seller.bills.map((b) => (
            <Row key={b.id} label={b.doc_no ?? "บิลใหม่ (ยังไม่มีเลขที่)"} value={b.remainingDisplay + " บาท"} />
          ))}
        </GroupCard>
        <Text style={styles.fieldLabel}>วิธีจ่าย</Text>
        <View style={styles.field}>
          <Segmented options={METHOD_OPTIONS} value={method} onChange={setMethod} />
        </View>
        {refusal !== null ? <Text style={styles.refusal}>{refusal}</Text> : null}
        {check.ok ? (
          <Button
            label={"ยืนยันจ่าย " + check.plan.amountDisplay + " บาท ให้ " + seller.name}
            icon="check"
            onPress={() => onPay(check.plan)}
            busy={busy}
            style={styles.payBtn}
          />
        ) : (
          <Text style={styles.refusal}>{check.message}</Text>
        )}
      </Card>
    </ScrollView>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.color.background },
    body: { padding: t.layout.screenPad, paddingBottom: t.layout.scrollGutter },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: t.space.lg },
    loading: { fontSize: t.type.bodyLg, color: t.color.textMuted },
    refusal: { fontSize: t.type.body, fontWeight: "800", color: t.color.danger, marginBottom: t.space.md },
    empty: { fontSize: t.type.bodyLg, color: t.color.textMuted, textAlign: "center", paddingVertical: t.space.xl },
    sellerBlock: { marginBottom: t.space.lg },
    payBtn: { marginTop: t.space.lg },
    backBtn: { alignSelf: "flex-start", marginBottom: t.space.sm },
    field: { marginBottom: t.space.lg },
    fieldLabel: {
      fontSize: t.type.body,
      fontWeight: "600",
      color: t.color.textSubtle,
      marginTop: t.space.md,
      marginBottom: t.space.sm,
      marginHorizontal: t.space.xs,
    },
    msgBadge: { alignItems: "flex-start", marginBottom: t.space.md },
    msgLine: { fontSize: t.type.bodyLg, color: t.color.text, lineHeight: 22, marginTop: t.space.sm },
    msgBtn: { marginTop: t.space.xl },
  });
}
