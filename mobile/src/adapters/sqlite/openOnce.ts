/**
 * ONE DATABASE OPEN PER JS PROCESS, PER NAME (A3 batch 1b, 2026-10-11).
 *
 * WHY. On Android a configuration change this app's activity does not handle (font size,
 * locale, density — the built manifest's `android:configChanges` lists only keyboard,
 * keyboardHidden, orientation, screenSize, screenLayout and uiMode) RELAUNCHES the activity,
 * and React Native runs "main" again in the SAME JS process: App.tsx's startup runs a second
 * time and opened the database a second time. expo-sqlite (16.0.10, Android) hands every later
 * open of the same path the SAME cached native object (`SQLiteModule.kt:110-113`) but wraps it
 * in a NEW JS object; when the older wrapper is garbage-collected, `sharedObjectDidRelease()`
 * closes the native binding (`NativeDatabase.kt:28-31`) underneath the still-cached object,
 * which is not marked closed. The next startup gets that dead handle and its first statement
 * fails — measured on the emulator: `Call to function 'NativeDatabase.execAsync' has been
 * rejected. → Caused by: java.lang.NullPointerException` on the SECOND relaunch in a process
 * (2 of 2), never on the first (0 of 3), shown as `เปิดฐานข้อมูลไม่สำเร็จ` with the session lost.
 *
 * WHAT THIS DOES. The first caller opens; a caller arriving while that open is in flight
 * awaits the same promise; every later caller gets the same handle. So there is exactly one
 * JS wrapper per process and nothing to be collected under a live connection. A REJECTED open
 * is not remembered — the next caller tries again rather than inheriting a failure forever.
 *
 * Pure (no expo, no node), so the node proof drives exactly this function.
 */
export type Opener<T> = (name: string) => Promise<T>;

export function openOncePerProcess<T>(open: Opener<T>): {
  open: Opener<T>;
  /** Forget a name (after its handle is closed), so the next open is a real one. */
  forget: (name: string) => void;
} {
  const handles = new Map<string, Promise<T>>();
  return {
    open(name: string): Promise<T> {
      const held = handles.get(name);
      if (held !== undefined) return held;
      const opening = open(name);
      handles.set(name, opening);
      opening.catch(() => {
        if (handles.get(name) === opening) handles.delete(name);
      });
      return opening;
    },
    forget(name: string): void {
      handles.delete(name);
    },
  };
}
