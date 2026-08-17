/**
 * THE ONLY MODAL ELEMENT IN THIS APP. Do not add a second one.
 *
 * The element below is deliberately the single textual occurrence of that tag in
 * `mobile/app/` and `mobile/App.tsx` — no comment in either place writes it, so a
 * scan for it finds code and never prose. `src/proof/proveSheets.ts` scans for
 * exactly that and reddens if the count is anything but one file.
 *
 * On iOS every Modal presents a view controller from the SAME parent — the
 * app's root controller — and react-native does not check whether that parent is
 * already presenting one. `RCTModalHostViewComponentView.ensurePresentedOnlyIfNeeded`
 * (react-native 0.81.5) sets its own `_isPresented = YES` and then calls
 * `presentViewController:`; UIKit refuses the second presentation, react-native
 * has already recorded it as a success, and nothing retries — both lifecycle
 * hooks that could are gated on `!_isPresented`. The result on a handset is a
 * button that does nothing, which is what the yard reported.
 *
 * So there is one host, it stays presented for as long as ANY sheet is on
 * screen, and switching sheets changes its CHILDREN. Nothing is dismissed and
 * nothing is presented at the moment the sheet changes, so the platform is never
 * asked to do the thing it cannot do.
 *
 * WHAT MUST NOT CHANGE HERE, and the reason is measured rather than stylistic:
 *
 *   `transparent` IS CONSTANT. It maps to `modalPresentationStyle`, which
 *   `updateProps` assigns on the live view controller; changing it on a
 *   presented modal is a change of presentation, which is the dismiss/present
 *   pair being avoided. It is `true` because a transparent host can carry an
 *   opaque sheet (every full-screen sheet in `app/` paints its own `flex: 1`
 *   background) while an opaque host cannot carry a dimmed dialog — the backdrop
 *   would sit on white instead of on the yard's screen.
 *
 *   `animationType` MAY change: react-native stores it and reads it when
 *   presenting or dismissing, so it moves no view controller by itself. It is
 *   passed through from the sheet on screen, which keeps the slide-up on the
 *   full-screen sheets and the fade on the dialogs for the presentation that
 *   opens the host and the dismissal that closes it. A switch BETWEEN sheets is
 *   not animated, because there is no longer a presentation to animate — that is
 *   the appearance this fix costs.
 *
 * `content` is null when nothing is open, and the host is then not visible.
 * Rendering only the sheet on screen means each one MOUNTS when it opens and
 * UNMOUNTS when it closes, so its form state starts clean. SellerPicker and
 * AddSellerSheet already cleared their own state on every exit, so for them this
 * changes nothing.
 */
import type { ReactNode } from "react";
import { Modal } from "react-native";

export type SheetAnimation = "slide" | "fade";

interface Props {
  /** The one sheet on screen, or null when the yard is looking at the app. */
  content: ReactNode | null;
  /** The animation for the presentation that opens the host. */
  animationType: SheetAnimation;
  /**
   * Android's back gesture. It must land on the same handler as the sheet's own
   * close button, never on a silent dismissal that leaves the stack believing a
   * sheet is still open.
   */
  onRequestClose: () => void;
}

export function SheetHost({ content, animationType, onRequestClose }: Props) {
  return (
    <Modal
      visible={content !== null}
      transparent
      animationType={animationType}
      onRequestClose={onRequestClose}
    >
      {content}
    </Modal>
  );
}
