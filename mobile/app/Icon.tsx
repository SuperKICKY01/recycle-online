/**
 * Icon — ONE drawn icon set at one stroke weight (P1.23 phase E), replacing the
 * text chevrons and glyphs the app drew as characters (›, ‹, ⋯, ⌫). Feather is a
 * 1.5px line set bundled with `@expo/vector-icons`, so no icon is a Unicode
 * stand-in (craft-floor: "Icons are drawn, from a real library"). Screens name
 * icons by ROLE; the family and the role→glyph map live only here, so the whole
 * app restyles its iconography from one place.
 */
import { type ComponentProps, type ReactElement } from "react";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "./theme";

export type IconName =
  | "chevron"
  | "back"
  | "down"
  | "up"
  | "logout"
  | "plus"
  | "close"
  | "search"
  | "settings"
  | "dashboard"
  | "prices"
  | "account"
  | "edit"
  | "trash"
  | "more"
  | "warn"
  | "check"
  | "clock"
  | "bills"
  | "sun"
  | "moon"
  | "device"
  | "history"
  | "seller"
  | "vehicle";

/** The value type is Feather's own glyph union, so an invalid glyph fails typecheck. */
type FeatherName = ComponentProps<typeof Feather>["name"];

const MAP: Record<IconName, FeatherName> = {
  chevron: "chevron-right",
  back: "chevron-left",
  down: "chevron-down",
  up: "chevron-up",
  logout: "log-out",
  plus: "plus",
  close: "x",
  search: "search",
  settings: "settings",
  dashboard: "bar-chart-2",
  prices: "tag",
  account: "user",
  edit: "edit-2",
  trash: "trash-2",
  more: "more-horizontal",
  warn: "alert-triangle",
  check: "check",
  clock: "clock",
  bills: "file-text",
  sun: "sun",
  moon: "moon",
  device: "smartphone",
  history: "rotate-ccw",
  seller: "user",
  vehicle: "truck",
};

export function Icon({
  name,
  size = 20,
  color,
}: {
  name: IconName;
  size?: number;
  color?: string;
}): ReactElement {
  const t = useTheme();
  return <Feather name={MAP[name]} size={size} color={color ?? t.color.text} />;
}
