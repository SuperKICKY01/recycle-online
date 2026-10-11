/**
 * THE CASHIER COUNTER — the unpaid queue and the payment form (STRUCTURE.md 2.1,
 * commit 2), and since the shifts unit's commit 3 the CASH DRAWER above the queue:
 * the shift panel, the blind count, cash movements, the pay-gate, the branch's own
 * method set and the channel picker (STRUCTURE.md 2.4). Reached from a header entry
 * gated on payments.record AND a branch whose separate_cashier is not known-off
 * (mayShowCounterEntry, src/counter/counterView.ts).
 *
 * PRESENTATION ONLY. Every sentence, gate, refusal, label and every satang of
 * arithmetic comes from src/counter/counterView.ts and src/counter/drawerView.ts,
 * where a headless proof reaches them; this file owns only SELECTION and EDIT
 * BUFFERS (which seller, which method, which channel, what has been typed, which of
 * the panel's forms is open) and renders what the models return. Money is a server
 * string shown byte-for-byte through the models' display() renderings — this file
 * never does money math.
 *
 * ONE SCROLL PER SCREEN. The queue view is one ScrollView holding the payment
 * refusal, the drawer and the sellers; the pay panel is one ScrollView that REPLACES
 * it (never two on screen at once). No Modal is added: the drawer's forms swap the
 * panel's CONTENT in place (lessons/a-platform-can-refuse-an-effect-and-record-it-
 * as-done.md), inside the counter sheet the one SheetHost already presents.
 *
 * R2 — THE COUNT IS BLIND. While the close form is open it REPLACES the whole panel,
 * so the running figure is off the screen, and CloseCountForm receives only the
 * figure-free model closeForm() returns. prove:counter reads this file and requires
 * CloseCountForm's body to name no drawer figure, with ShiftPanelCard as the control.
 */
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  checkPayment,
  defaultDraft,
  DRAWER_ONLY_NOTE,
  METHOD_LABEL,
  PARTIAL_NOTE,
  PAY_BUTTON_PREFIX,
  QUEUE_TITLE,
  type CounterMessage,
  type CounterScreenState,
  type PaymentMethod,
  type PaymentPlan,
  type QueueSeller,
} from "../src/counter/counterView";
import {
  BAHT,
  CANCEL_LABEL,
  CASH_KINDS,
  CASH_KIND_LABEL,
  channelPicker,
  checkCountedCash,
  checkMovementAmount,
  checkOpeningFloat,
  checkReason,
  closeForm,
  MOVEMENT_AMOUNT_LABEL,
  MOVEMENT_HEADING,
  MOVEMENT_NOTE_LABEL,
  MOVEMENT_SAVE_LABEL,
  NO_METHOD_LINE,
  NOTE_MAX,
  PANEL_HEADING,
  REASON_MAX,
  type CashKind,
  type CloseForm,
  type CloseResult,
  type PayGate,
  type ShiftPanel,
  type ShopChannel,
} from "../src/counter/drawerView";
import { Badge, Button, Card, Field, Figure, GroupCard, Row, SectionHeading, Segmented, type Tone } from "./Kit";
import { Touchable } from "./Press";
import { Icon } from "./Icon";
import { SheetHeader } from "./SheetHeader";
import { useTheme, type ThemeTokens } from "./theme";

const MESSAGE_TONE: Record<CounterMessage["tone"], Tone> = {
  offline: "warning",
  session: "info",
  error: "danger",
};

/** The variance's tone on the result card: exact is calm, a difference is flagged. */
const VARIANCE_TONE: Record<CloseResult["tone"], Tone> = {
  exact: "success",
  over: "warning",
  short: "danger",
};

/**
 * What the drawer half of the screen draws from — all of it computed by the app
 * from drawerView (the panel, the gate, the method set, the channel list and the
 * last close's result). `panel` is null when this principal is not shown one
 * (mayShowShiftPanel).
 */
export interface CounterDrawer {
  readonly panel: ShiftPanel | null;
  readonly gate: PayGate;
  readonly methods: readonly PaymentMethod[];
  readonly channels: readonly ShopChannel[] | null;
  readonly closed: CloseResult | null;
  /** The last drawer write's refusal, worded by drawerOutcome, or null. */
  readonly refusal: string | null;
  readonly busy: boolean;
}

export interface CounterDrawerActions {
  readonly onOpenShift: (openingFloat: string) => void;
  readonly onMovement: (kind: CashKind, amount: string, note: string) => void;
  readonly onCloseShift: (shiftId: string, countedCash: string) => void;
  readonly onReason: (shiftId: string, reason: string) => void;
  readonly onDismissClosed: () => void;
}

export function CounterScreen({
  state,
  queueShown,
  refusal,
  busy,
  drawer,
  actions,
  onClose,
  onRetry,
  onSignIn,
  onPay,
}: {
  /** The queue or a message, or null while the first read is in flight. */
  readonly state: CounterScreenState | null;
  /** mayShowQueue over the live policy: false for a shop that reached this screen
   *  through the drawer branch alone — the shift panel shows, the queue is not read. */
  readonly queueShown: boolean;
  /** The last payment's refusal, worded by counterView, or null. */
  readonly refusal: string | null;
  readonly busy: boolean;
  readonly drawer: CounterDrawer;
  readonly actions: CounterDrawerActions;
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
      <SheetHeader title={QUEUE_TITLE} onClose={onClose} />
      {!queueShown ? (
        <QueueBody
          queue={null}
          refusal={refusal}
          busy={busy}
          drawer={drawer}
          actions={actions}
          onRetry={onRetry}
          onPay={onPay}
        />
      ) : state === null ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.loading}>กำลังอ่านบิลค้างจ่ายจากระบบ…</Text>
        </View>
      ) : state.kind === "message" ? (
        <MessageBody message={state.message} onRetry={onRetry} onSignIn={onSignIn} />
      ) : (
        <QueueBody
          queue={state.queue}
          refusal={refusal}
          busy={busy}
          drawer={drawer}
          actions={actions}
          onRetry={onRetry}
          onPay={onPay}
        />
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
  drawer,
  actions,
  onRetry,
  onPay,
}: {
  /** null: this screen shows no queue (the drawer branch alone, mayShowQueue). */
  queue: Extract<CounterScreenState, { kind: "queue" }>["queue"] | null;
  refusal: string | null;
  busy: boolean;
  drawer: CounterDrawer;
  actions: CounterDrawerActions;
  onRetry: () => void;
  onPay: (plan: PaymentPlan) => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  // The pay panel selection: which seller is being paid, or null (showing the list).
  const [paying, setPaying] = useState<QueueSeller | null>(null);
  const gateClosed = drawer.gate.kind === "shift_first";

  if (queue === null) {
    // A DRAWER PAGE, not an empty counter: the panel, then one calm line saying why
    // there is no list — never the empty-queue sentence, which would claim a queue
    // exists and is empty. (Named, not quoted: prove:counter A3 scans this branch.)
    return (
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <DrawerSection drawer={drawer} actions={actions} onRetry={onRetry} />
        <Text style={styles.drawerOnlyNote}>{DRAWER_ONLY_NOTE}</Text>
      </ScrollView>
    );
  }

  if (paying !== null) {
    return (
      <PayPanel
        seller={paying}
        refusal={refusal}
        busy={busy}
        gate={drawer.gate}
        methods={drawer.methods}
        channels={drawer.channels}
        onBack={() => setPaying(null)}
        onPay={onPay}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      {refusal !== null ? <Text style={styles.refusal}>{refusal}</Text> : null}
      <DrawerSection drawer={drawer} actions={actions} onRetry={onRetry} />
      {queue.isEmpty ? (
        <Card>
          <Text style={styles.empty}>ไม่มีบิลค้างจ่าย</Text>
        </Card>
      ) : (
        queue.sellers.map((seller) => (
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
              {/* R1: with shifts on and no shift open, the pay action is NOT drawn;
                  the drawer above offers the open-shift form in its place. */}
              {gateClosed ? (
                <Text style={styles.gateLine}>{drawer.gate.kind === "shift_first" ? drawer.gate.line : ""}</Text>
              ) : (
                <Button
                  label={PAY_BUTTON_PREFIX + seller.outstandingDisplay + " บาท"}
                  icon="check"
                  onPress={() => setPaying(seller)}
                  style={styles.payBtn}
                />
              )}
            </Card>
          </View>
        ))
      )}
    </ScrollView>
  );
}

/* ------------------------------------------------------------- the drawer ---- */

/**
 * The drawer above the queue: the last close's result while it is being read, else
 * the shift panel (or nothing, for a principal not shown one). The panel's three
 * forms — open, movement, count — are local EDIT state and swap its content.
 */
function DrawerSection({
  drawer,
  actions,
  onRetry,
}: {
  drawer: CounterDrawer;
  actions: CounterDrawerActions;
  onRetry: () => void;
}) {
  if (drawer.closed !== null) {
    return (
      <View>
        <SectionHeading>{PANEL_HEADING}</SectionHeading>
        <CloseResultCard
          result={drawer.closed}
          refusal={drawer.refusal}
          busy={drawer.busy}
          onReason={actions.onReason}
          onDone={actions.onDismissClosed}
        />
      </View>
    );
  }
  if (drawer.panel === null) return null;
  return (
    <View>
      <SectionHeading>{PANEL_HEADING}</SectionHeading>
      <ShiftPanelCard
        panel={drawer.panel}
        refusal={drawer.refusal}
        busy={drawer.busy}
        actions={actions}
        onRetry={onRetry}
      />
    </View>
  );
}

type PanelMode = "view" | "movement" | "count";

/**
 * The shift panel — closed (float + open), open (when, by whom, the running figure
 * if the server sent it, record cash in/out, close), or a message. The running
 * figure is drawn from `panel.figure` ONLY (R4): a panel whose figure is null draws
 * none, and nothing here computes one.
 */
function ShiftPanelCard({
  panel,
  refusal,
  busy,
  actions,
  onRetry,
}: {
  panel: ShiftPanel;
  refusal: string | null;
  busy: boolean;
  actions: CounterDrawerActions;
  onRetry: () => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [mode, setMode] = useState<PanelMode>("view");
  const [float, setFloat] = useState("");
  const [floatError, setFloatError] = useState<string | null>(null);
  // A panel that is no longer open (closed elsewhere, reloaded) drops any open form.
  useEffect(() => {
    if (panel.kind !== "open") setMode("view");
  }, [panel.kind]);

  if (panel.kind === "message") {
    return (
      <Card>
        <View style={styles.msgBadge}>
          <Badge tone="warning">{panel.badge}</Badge>
        </View>
        <Text style={styles.msgLine}>{panel.line}</Text>
        {panel.retry ? <Button label="ลองอีกครั้ง" kind="ghost" onPress={onRetry} style={styles.msgBtn} /> : null}
      </Card>
    );
  }

  if (panel.kind === "closed") {
    const submit = (): void => {
      const c = checkOpeningFloat(float);
      if (!c.ok) {
        setFloatError(c.message);
        return;
      }
      setFloatError(null);
      actions.onOpenShift(c.value);
    };
    return (
      <Card>
        <View style={styles.msgBadge}>
          <Badge tone="neutral">{panel.badge}</Badge>
        </View>
        {panel.gateLine !== null ? <Text style={styles.gateLead}>{panel.gateLine}</Text> : null}
        <Field
          label={panel.floatLabel}
          hint={panel.floatHint}
          {...(floatError !== null ? { error: floatError } : {})}
          value={float}
          onChangeText={setFloat}
          keyboardType="decimal-pad"
          placeholder="0.00"
          style={styles.field}
        />
        {refusal !== null ? <Text style={styles.refusal}>{refusal}</Text> : null}
        <Button label={panel.openLabel} onPress={submit} busy={busy} />
      </Card>
    );
  }

  // OPEN. The count form REPLACES the whole panel (R2): the figure is off-screen.
  if (mode === "count") {
    return (
      <CloseCountForm
        form={closeForm()}
        refusal={refusal}
        busy={busy}
        onConfirm={(counted) => actions.onCloseShift(panel.shiftId, counted)}
        onCancel={() => setMode("view")}
      />
    );
  }
  if (mode === "movement") {
    return (
      <MovementForm
        refusal={refusal}
        busy={busy}
        onSave={(kind, amount, note) => {
          actions.onMovement(kind, amount, note);
          setMode("view");
        }}
        onCancel={() => setMode("view")}
      />
    );
  }
  return (
    <Card>
      <View style={styles.msgBadge}>
        <Badge tone="success">{panel.badge}</Badge>
      </View>
      {panel.figure !== null ? (
        <Figure label={panel.figure.label} value={panel.figure.value} unit={BAHT} hero />
      ) : null}
      <GroupCard>
        <Row label={panel.openedAt.label} value={panel.openedAt.value} />
        {panel.openedBy !== null ? <Row label={panel.openedBy.label} value={panel.openedBy.value} /> : null}
        {panel.breakdown.map((line) => (
          <Row key={line.label} label={line.label} value={line.value + " " + BAHT} />
        ))}
      </GroupCard>
      {refusal !== null ? <Text style={styles.refusal}>{refusal}</Text> : null}
      <View style={styles.actionRow}>
        <Button
          label={panel.movementLabel}
          kind="secondary"
          onPress={() => setMode("movement")}
          disabled={busy}
          style={styles.actionBtn}
        />
        <Button
          label={panel.closeLabel}
          kind="secondary"
          onPress={() => setMode("count")}
          disabled={busy}
          style={styles.actionBtn}
        />
      </View>
    </Card>
  );
}

/**
 * R2 — THE BLIND COUNT. Receives the figure-free CloseForm and nothing else that
 * could carry a figure: no panel, no shift, no drawer. Its body must never name one
 * (prove:counter reads this function's source).
 */
function CloseCountForm({
  form,
  refusal,
  busy,
  onConfirm,
  onCancel,
}: {
  form: CloseForm;
  refusal: string | null;
  busy: boolean;
  onConfirm: (countedCash: string) => void;
  onCancel: () => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [counted, setCounted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = (): void => {
    const c = checkCountedCash(counted);
    if (!c.ok) {
      setError(c.message);
      return;
    }
    setError(null);
    onConfirm(c.value);
  };
  return (
    <Card>
      <Text style={styles.formHead}>{form.heading}</Text>
      {form.lines.map((line, i) => (
        <Text key={i} style={styles.formLine}>
          {line}
        </Text>
      ))}
      <Field
        label={form.countedLabel}
        {...(error !== null ? { error } : {})}
        value={counted}
        onChangeText={setCounted}
        keyboardType="decimal-pad"
        placeholder="0.00"
        style={styles.field}
      />
      {refusal !== null ? <Text style={styles.refusal}>{refusal}</Text> : null}
      <Button label={form.confirmLabel} onPress={submit} busy={busy} />
      <Button label={form.cancelLabel} kind="ghost" onPress={onCancel} disabled={busy} style={styles.cancelBtn} />
    </Card>
  );
}

/** R5 — record a cash movement: one of four kinds, a positive amount, a note. */
function MovementForm({
  refusal,
  busy,
  onSave,
  onCancel,
}: {
  refusal: string | null;
  busy: boolean;
  onSave: (kind: CashKind, amount: string, note: string) => void;
  onCancel: () => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [kind, setKind] = useState<CashKind>("float_in");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = (): void => {
    const c = checkMovementAmount(amount);
    if (!c.ok) {
      setError(c.message);
      return;
    }
    setError(null);
    onSave(kind, c.value, note);
  };
  return (
    <Card>
      <Text style={styles.formHead}>{MOVEMENT_HEADING}</Text>
      <View style={styles.chips}>
        {CASH_KINDS.map((k) => {
          const on = k === kind;
          return (
            <Touchable
              key={k}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => setKind(k)}
              haptic="light"
              accessibilityLabel={CASH_KIND_LABEL[k]}
              selected={on}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{CASH_KIND_LABEL[k]}</Text>
            </Touchable>
          );
        })}
      </View>
      <Field
        label={MOVEMENT_AMOUNT_LABEL}
        {...(error !== null ? { error } : {})}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0.00"
        style={styles.field}
      />
      <Field
        label={MOVEMENT_NOTE_LABEL}
        value={note}
        onChangeText={setNote}
        maxLength={NOTE_MAX}
        style={styles.field}
      />
      {refusal !== null ? <Text style={styles.refusal}>{refusal}</Text> : null}
      <Button label={MOVEMENT_SAVE_LABEL} onPress={submit} busy={busy} />
      <Button label={CANCEL_LABEL} kind="ghost" onPress={onCancel} disabled={busy} style={styles.cancelBtn} />
    </Card>
  );
}

/**
 * R2/R3 — the result, from the CLOSE RESPONSE: the expected figure and the variance
 * appear here for the first time. A non-zero variance with no reason asks once; a
 * reason already set is shown and not editable.
 */
function CloseResultCard({
  result,
  refusal,
  busy,
  onReason,
  onDone,
}: {
  result: CloseResult;
  refusal: string | null;
  busy: boolean;
  onReason: (shiftId: string, reason: string) => void;
  onDone: () => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = (): void => {
    const c = checkReason(reason);
    if (!c.ok) {
      setError(c.message);
      return;
    }
    setError(null);
    onReason(result.shiftId, c.value);
  };
  const r = result.reason;
  return (
    <Card>
      <View style={styles.msgBadge}>
        <Badge tone="neutral">{result.badge}</Badge>
      </View>
      <Figure label={result.counted.label} value={result.counted.value} unit={BAHT} />
      <Figure label={result.expected.label} value={result.expected.value} unit={BAHT} />
      <Figure label={result.variance.label} value={result.variance.value} unit={BAHT} />
      <View style={styles.msgBadge}>
        <Badge tone={VARIANCE_TONE[result.tone]}>{result.word}</Badge>
      </View>
      {r.kind === "ask" ? (
        <>
          <Field
            label={r.label}
            hint={r.hint}
            {...(error !== null ? { error } : {})}
            value={reason}
            onChangeText={setReason}
            maxLength={REASON_MAX}
            multiline
            style={styles.field}
          />
          {refusal !== null ? <Text style={styles.refusal}>{refusal}</Text> : null}
          <Button label={r.submitLabel} onPress={submit} busy={busy} />
        </>
      ) : r.kind === "shown" ? (
        <View style={styles.reasonBox}>
          <Text style={styles.reasonLabel}>{r.label}</Text>
          <Text style={styles.reasonText}>{r.text}</Text>
        </View>
      ) : r.kind === "frozen" ? (
        <Text style={styles.formLine}>{r.line}</Text>
      ) : null}
      {r.kind !== "ask" && refusal !== null ? <Text style={styles.refusal}>{refusal}</Text> : null}
      <Button label={result.doneLabel} kind="ghost" onPress={onDone} disabled={busy} style={styles.cancelBtn} />
    </Card>
  );
}

/* -------------------------------------------------------------- pay panel ---- */

/**
 * The pay panel: pay this seller's unpaid bills in full, choose the method, confirm.
 * The plan is computed by checkPayment (the pure model) so the panel SHOWS what will
 * be paid — the total and the per-bill breakdown — before onPay commits it. The
 * methods are the branch's ACTIVE ones (R7); a non-cash method with an active shop
 * channel shows the OPTIONAL channel picker (R6); a closed pay-gate (R1) draws no
 * confirm.
 */
function PayPanel({
  seller,
  refusal,
  busy,
  gate,
  methods,
  channels,
  onBack,
  onPay,
}: {
  seller: QueueSeller;
  refusal: string | null;
  busy: boolean;
  gate: PayGate;
  methods: readonly PaymentMethod[];
  channels: readonly ShopChannel[] | null;
  onBack: () => void;
  onPay: (plan: PaymentPlan) => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const first = methods[0] ?? null;
  const [method, setMethod] = useState<PaymentMethod | null>(first);
  const [channelId, setChannelId] = useState<string | null>(null);
  // The method set can change under the panel (a reload): never keep a method the
  // branch no longer offers.
  useEffect(() => {
    if (method === null || !methods.includes(method)) setMethod(first);
  }, [methods, method, first]);

  const methodOptions = methods.map((m) => ({ value: m, label: METHOD_LABEL[m] }));
  const picker = method === null ? null : channelPicker(method, channels);
  const chosenChannel = picker !== null && picker.options.some((o) => o.id === channelId) ? channelId : null;

  // Pay every unpaid bill its full remaining — the yard's common case (multi-bill).
  const check =
    method === null
      ? null
      : checkPayment({
          ...defaultDraft(
            seller.seller_id,
            method,
            seller.bills.map((b) => ({ id: b.id, remaining: b.remaining })),
          ),
          channel_id: chosenChannel,
        });

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Button label="‹ กลับไปที่รายการ" kind="ghost" onPress={onBack} style={styles.backBtn} />
      <SectionHeading>{"จ่ายให้ " + seller.name}</SectionHeading>
      <Card>
        {check !== null && check.ok ? (
          <Figure label="ยอดที่จะจ่าย" value={check.plan.amountDisplay} unit="บาท" hero />
        ) : null}
        <GroupCard>
          {seller.bills.map((b) => (
            <Row key={b.id} label={b.doc_no ?? "บิลใหม่ (ยังไม่มีเลขที่)"} value={b.remainingDisplay + " บาท"} />
          ))}
        </GroupCard>
        <Text style={styles.fieldLabel}>วิธีจ่าย</Text>
        {method === null ? (
          <Text style={styles.gateLine}>{NO_METHOD_LINE}</Text>
        ) : methodOptions.length > 1 ? (
          <View style={styles.fieldBlock}>
            <Segmented options={methodOptions} value={method} onChange={setMethod} />
          </View>
        ) : (
          <Text style={styles.singleMethod}>{METHOD_LABEL[method]}</Text>
        )}
        {picker !== null && picker.show ? (
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>{picker.label}</Text>
            <GroupCard>
              {[{ id: null as string | null, line: picker.noneLabel }, ...picker.options].map((o) => {
                const on = o.id === chosenChannel;
                return (
                  <Touchable
                    key={o.id ?? "__none__"}
                    onPress={() => setChannelId(o.id)}
                    haptic="light"
                    accessibilityLabel={o.line}
                    selected={on}
                    style={styles.pickRow}
                  >
                    <Text style={[styles.pickText, on && styles.pickTextOn]}>{o.line}</Text>
                    {on ? <Icon name="check" size={18} color={t.color.primary} /> : null}
                  </Touchable>
                );
              })}
            </GroupCard>
          </View>
        ) : null}
        {refusal !== null ? <Text style={styles.refusal}>{refusal}</Text> : null}
        {gate.kind === "shift_first" ? (
          <Text style={styles.gateLine}>{gate.line}</Text>
        ) : check === null ? null : check.ok ? (
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
    fieldBlock: { marginBottom: t.space.lg },
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
    // The pay-gate: why nothing can be paid yet. Warning ink, not danger — it is an
    // instruction, not a failure (correct-classification-can-still-render-as-an-error).
    gateLine: { fontSize: t.type.body, fontWeight: "700", color: t.color.warningFg, marginTop: t.space.lg },
    gateLead: { fontSize: t.type.bodyLg, fontWeight: "700", color: t.color.warningFg, marginBottom: t.space.lg },
    singleMethod: { fontSize: t.type.bodyLg, fontWeight: "700", color: t.color.text, marginBottom: t.space.lg, marginHorizontal: t.space.xs },
    field: { marginBottom: t.space.lg },
    formHead: { fontSize: t.type.subhead, fontWeight: "800", color: t.color.text, marginBottom: t.space.md },
    formLine: { fontSize: t.type.body, color: t.color.textMuted, marginBottom: t.space.md, lineHeight: 20 },
    cancelBtn: { marginTop: t.space.sm },
    actionRow: { flexDirection: "row", flexWrap: "wrap", gap: t.space.md, marginTop: t.space.lg },
    actionBtn: { flexGrow: 1 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.md, marginBottom: t.space.lg },
    chip: {
      minHeight: t.tapMin, paddingHorizontal: t.space.xl, borderRadius: t.radius.lg, borderWidth: 1,
      borderColor: t.color.border, backgroundColor: t.color.surface, alignItems: "center", justifyContent: "center",
    },
    chipOn: { backgroundColor: t.color.primary, borderColor: t.color.primary },
    chipText: { fontSize: t.type.body, fontWeight: "700", color: t.color.neutralFg },
    chipTextOn: { color: t.color.onPrimary },
    pickRow: {
      minHeight: t.tapMin, flexDirection: "row", alignItems: "center", gap: t.space.md,
      paddingHorizontal: t.layout.cardPad, paddingVertical: t.space.md,
    },
    pickText: { flex: 1, fontSize: t.type.bodyLg, color: t.color.text },
    pickTextOn: { fontWeight: "700", color: t.color.primary },
    reasonBox: { marginTop: t.space.md, marginBottom: t.space.md },
    reasonLabel: { fontSize: t.type.body, fontWeight: "600", color: t.color.textSubtle, marginBottom: t.space.xs },
    reasonText: { fontSize: t.type.bodyLg, color: t.color.text },
    drawerOnlyNote: {
      fontSize: t.type.body, color: t.color.textMuted, lineHeight: 20,
      marginTop: t.space.md, marginHorizontal: t.space.xs,
    },
  });
}
