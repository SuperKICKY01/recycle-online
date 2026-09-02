/**
 * THE SHOP'S PEOPLE — the roster, add-a-user, and the row that opens the actions
 * sheet (P3.7). Reached from an ADMIN-ONLY row inside settings; a staff session
 * never sees the entry, and GET /users refuses it 403 regardless.
 *
 * PRESENTATION ONLY. Every sentence, gate, refusal and bound comes from
 * src/users/usersAdmin.ts, where a headless proof reaches them; this file owns only
 * the add-form BUFFERS. The first password lives in a buffer that dies with the
 * sheet and is cleared the moment a create is submitted — it is never logged and
 * never persisted (D8: the admin types it and hands it over; the person changes it
 * themselves later). Per-user actions (reset / deactivate / reactivate) are the
 * UserActionsSheet's, opened over this one through the single SheetHost.
 */
import { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  checkNewUser,
  FIRST_PASSWORD_NOTE,
  FULL_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
  type UserCreateBody,
  type UserRole,
  type UserRow,
  type UsersMessage,
  type UsersScreenState,
} from "../src/users/usersAdmin";
import {
  Badge,
  Button,
  Card,
  Field,
  GroupCard,
  Row,
  SectionHeading,
  Segmented,
  type Tone,
} from "./Kit";
import { SheetHeader } from "./SheetHeader";
import { Touchable } from "./Press";
import { useTheme, type ThemeTokens } from "./theme";

const MESSAGE_TONE: Record<UsersMessage["tone"], Tone> = {
  offline: "warning",
  session: "info",
  error: "danger",
};

const ROLE_OPTIONS: readonly { value: UserRole; label: string }[] = [
  { value: "staff", label: "พนักงาน" },
  { value: "admin", label: "ผู้ดูแลระบบ" },
];

export function UsersScreen({
  state,
  refusal,
  busy,
  onClose,
  onRetry,
  onSignIn,
  onCreate,
  onUserMenu,
}: {
  /** The roster or a message, or null while the first read is in flight. */
  readonly state: UsersScreenState | null;
  /** The last write's refusal, worded by usersAdmin, or null. Shown above the list. */
  readonly refusal: string | null;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onRetry: () => void;
  readonly onSignIn: () => void;
  /** The app POSTs the create and re-reads the roster; this passes a valid body. */
  readonly onCreate: (body: UserCreateBody) => void;
  /** Open the ⋯ actions for a row. App.tsx writes the target WITH the open. */
  readonly onUserMenu: (row: UserRow) => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.fill}>
      <SheetHeader title="จัดการผู้ใช้งาน" onClose={onClose} />
      {state === null ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.loading}>กำลังอ่านรายชื่อผู้ใช้จากระบบ…</Text>
        </View>
      ) : state.kind === "message" ? (
        <MessageBody message={state.message} onRetry={onRetry} onSignIn={onSignIn} />
      ) : (
        <RosterBody
          screen={state}
          refusal={refusal}
          busy={busy}
          onCreate={onCreate}
          onUserMenu={onUserMenu}
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
  message: UsersMessage;
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

function RosterBody({
  screen,
  refusal,
  busy,
  onCreate,
  onUserMenu,
}: {
  screen: Extract<UsersScreenState, { kind: "roster" }>;
  refusal: string | null;
  busy: boolean;
  onCreate: (body: UserCreateBody) => void;
  onUserMenu: (row: UserRow) => void;
}) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const model = screen.screen;
  const editable = model.editable;

  // THE ADD-USER BUFFER. Component-local, so it dies when the sheet closes. The
  // password is cleared the instant a valid create is submitted (see submit).
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("staff");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (): void => {
    const v = checkNewUser({ username, full_name: fullName, role, password });
    if (!v.ok) {
      setError(v.message);
      return;
    }
    // Hand the body off, then clear the buffer — the first password does not
    // linger in any state after the request leaves.
    onCreate(v.body);
    setUsername("");
    setFullName("");
    setRole("staff");
    setPassword("");
    setError(null);
  };

  const renderRow = (row: UserRow) => {
    // onPress is included ONLY when editable — exactOptionalPropertyTypes rejects an
    // explicit `undefined` on an optional prop, and a read-only (staff) view, which
    // a rendered roster never actually is, simply gets a non-tappable row.
    const interactive = editable
      ? { chevron: true, onPress: () => onUserMenu(row) }
      : { chevron: false };
    return (
      <Row
        key={row.user_id}
        label={row.full_name}
        value={row.roleLabel}
        hint={"@" + row.username + (row.isSelf ? " · บัญชีของคุณ" : "")}
        {...interactive}
      />
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.body}>
      {refusal !== null ? <Text style={styles.refusal}>{refusal}</Text> : null}

      <SectionHeading>{model.activeHeading}</SectionHeading>
      <GroupCard>{model.activeRows.map(renderRow)}</GroupCard>

      {model.inactiveRows.length > 0 ? (
        <>
          <SectionHeading>{model.inactiveHeading}</SectionHeading>
          <GroupCard>{model.inactiveRows.map(renderRow)}</GroupCard>
        </>
      ) : null}

      {editable ? (
        <>
          <SectionHeading>เพิ่มผู้ใช้</SectionHeading>
          <Card>
            <Field
              label="ชื่อผู้ใช้"
              value={username}
              onChangeText={(v) => {
                setUsername(v);
                setError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={USERNAME_MAX_LENGTH}
              style={styles.field}
            />
            <Field
              label="ชื่อ-นามสกุล"
              value={fullName}
              onChangeText={(v) => {
                setFullName(v);
                setError(null);
              }}
              maxLength={FULL_NAME_MAX_LENGTH}
              style={styles.field}
            />
            <Text style={styles.fieldLabel}>สิทธิ์</Text>
            <View style={styles.field}>
              <Segmented options={ROLE_OPTIONS} value={role} onChange={setRole} />
            </View>
            <Field
              label="รหัสผ่านแรก"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                setError(null);
              }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={PASSWORD_MAX_LENGTH}
              style={styles.field}
            />
            <Text style={styles.note}>{FIRST_PASSWORD_NOTE}</Text>
            {error !== null ? <Text style={styles.refusal}>{error}</Text> : null}
            <Button label="เพิ่มผู้ใช้" icon="plus" onPress={submit} busy={busy} style={styles.addBtn} />
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: t.color.background },
    body: { padding: t.layout.screenPad, paddingBottom: t.layout.scrollGutter },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: t.space.lg },
    loading: { fontSize: t.type.bodyLg, color: t.color.textMuted },
    refusal: {
      fontSize: t.type.body,
      fontWeight: "800",
      color: t.color.danger,
      marginBottom: t.space.md,
    },
    note: { fontSize: t.type.body, color: t.color.textMuted, lineHeight: 20, marginTop: t.space.md },
    field: { marginBottom: t.space.lg },
    fieldLabel: {
      fontSize: t.type.body,
      fontWeight: "600",
      color: t.color.textSubtle,
      marginBottom: t.space.sm,
      marginHorizontal: t.space.xs,
    },
    addBtn: { marginTop: t.space.lg },
    msgBadge: { alignItems: "flex-start", marginBottom: t.space.md },
    msgLine: { fontSize: t.type.bodyLg, color: t.color.text, lineHeight: 22, marginTop: t.space.sm },
    msgBtn: { marginTop: t.space.xl },
  });
}
