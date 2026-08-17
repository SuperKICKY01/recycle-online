# A platform can refuse an effect and record it as done

**Applies to** every effect your code asks a layer below it to perform and cannot
itself observe — a native presentation, a permission prompt, a notification, a
clipboard write, a file picker, a keystore entry, a background task registration.
And hardest when the symptom is *a control that does nothing*.

**The rule:** when an effect silently does not happen, ask whether the layer below
records **INTENT** or **OUTCOME** — and answer it by READING THAT LAYER'S SOURCE,
not by reasoning about what it probably does. If it stores intent, then "asked
for" and "happened" are the same bit, every reading above it agrees, and no
amount of care in your own state will ever disagree with the screen.

## The instance

`+ เพิ่มผู้ขาย`, the add-seller control inside the seller picker, did nothing on
first press. Consistently, on a real handset, observed by the owner on
2026-08-17. Pressing `ปิด` — which dismisses the picker — made the sheet appear.

**The state was right and the component rendered.** `App.tsx` set
`addSellerOpen` from the picker's own header, `AddSellerSheet` was mounted as a
sibling with `visible={addSellerOpen}`, and nothing in the app cleared it. Every
JavaScript-visible fact said the sheet was open. **The effect was dropped one
layer below anything a JavaScript reading can reach.**

## What the source says, and it is six lines

react-native **0.81.5**, `node_modules/react-native/React/Fabric/Mounting/ComponentViews/Modal/RCTModalHostViewComponentView.mm`:

```objc
107:  BOOL _shouldPresent;
108:  BOOL _isPresented;

151:  BOOL shouldBePresented = !_isPresented && _shouldPresent && self.window;
156:    _isPresented = YES;
157:    [self presentViewController:self.viewController
139:  [controller presentViewController:modalViewController animated:animated completion:completion];
```

At `:139` `controller` is `[self reactViewController]` — the app's root view
controller, **shared by every Modal in the tree**. There is no check for a
controller that is already presenting, and no queue across instances: each host
view knows only its own `_isPresented`.

**`_isPresented = YES` is set at `:156`, BEFORE the call at `:157`.** So a
presentation UIKit refuses is recorded as one that succeeded. And nothing
retries: `:203 didMoveToWindow` and `:209 didMoveToSuperview` both call
`ensurePresentedOnlyIfNeeded`, and `:151` gates it on `!_isPresented`, which is
now false for ever. `:282` `_shouldPresent = newProps.visible;` is the only other
input, and it is unchanged.

**A refused presentation is therefore indistinguishable from a successful one at
every layer JavaScript can read.** `onShow` does not fire, which is the one
available signal, and nothing in the app was listening for it — nor would a
listener have helped, because absence of an event is not an event.

## What it cost

**A device pass, spent on a state hypothesis**, because the only visible evidence
pointed at the app. That is the whole price of this lesson: the search was
conducted in the correct file, on correct code, and every reading of it came back
innocent — the same shape as `CLAUDE.md § Boot check` "WHICH BUNDLE THE HANDSET IS
RUNNING" and its server-side twin, where the screen becomes evidence about source
that is not running.

## Why this is a file and not a note at the site

It is not about modals. It is about any SDK boundary where **the recording of an
operation happens on the near side of the operation**, which is an ordinary way
to write a wrapper: set the flag, then do the thing, because the flag is what
stops you doing it twice. That is correct when the call cannot fail and silent
when it can.

The generalisation is a question to ask of a wrapper, not a fact to remember:
**if this call were refused, what in this object would be different?** Here the
answer is *nothing*, and the answer was available in six lines of a file already
on disk.

## And what reading it BOUGHT, which is the part worth the file

The defect was located without reading any of this — the owner's observation that
`ปิด` reveals the sheet is already a disproof of a state bug, since state that
was never set would not produce a sheet later either. Reading the source did not
find the bug. **It decided the fix, and it eliminated the one that looks
cleverest.**

Three shapes were on the table: nest the inner sheet inside the outer one's
Modal; hold ONE `openSheet` state so two cannot be true; or one Modal host whose
CONTENT is selected by state. `:282` is what refutes the second — `_shouldPresent
= newProps.visible` is evaluated **per instance**, so two instances flipping in
one commit is still one dismissal and one presentation, and iOS is still being
asked to dismiss-then-present in a single turn. **A single state variable renames
that failure without removing it, and no headless proof can see the difference.**
The same six lines are what prove the third shape works: with one host
`_isPresented` stays YES and `_shouldPresent` does not change, so at `:151`
`shouldBePresented` is false and the dismiss branch's condition is false too —
neither fires, and only the children swap.

**Choosing between fixes is the thing source-reading is for.** All three shapes
are defensible from the symptom alone; only the source says which two leave the
mechanism in place.

## A second finding in the same file, which is why "it worked before" is not evidence

`node_modules/react-native/Libraries/Modal/Modal.js:280`:

```js
return this.props.visible === true || this.state.isRendered === true;
```

`isRendered` is set true on a false→true transition and cleared only by the
`modalDismissed` event or by unmount — and `:243` says in its own comment that
the event is *"for the old renderer in iOS only"*. Under the new renderer it
therefore never clears, so **on iOS a Modal's host view, once opened, stays
mounted for the rest of the app's life** while `:287-288` returns null for one
that has never been opened. Component state inside a closed sheet survives, which
looks like a feature and is a side effect of a latch. One real behaviour in this
app rested on it: `BillsPanel` kept a half-typed void reason across a close.

**Read the version you have.** All of the above is 0.81.5. Every line number here
will move, and the `modalDismissed` comment describes a renderer being removed —
if these citations do not resolve, that is the lesson working, not failing.

## How to apply

1. **Ask INTENT or OUTCOME of any effect you cannot observe**, and get the answer
   from the source. "It probably checks" is the assumption this lesson exists to
   remove.
2. **Prefer a fix that makes the refusable call happen once.** One presentation
   that stays up cannot be refused a second time. Two of anything sharing one
   parent is the shape to design out, not to sequence more carefully.
3. **Do not accept a fix whose proof cannot distinguish it from the defect.** If
   a headless test would be equally green before and after, the fix is a
   preference. Here that test names the second shape exactly.
4. **When the symptom is "nothing happened", the state layer is the wrong place
   to look second.** Look there once; when it is clean, go DOWN, not sideways.

Sibling of [[a-value-comparison-cannot-prove-a-path]] pointed at effects instead
of data — there a correct value proves nothing about the route it took, here a
correct state proves nothing about the effect it asked for. And the near miss
worth naming: this is NOT
[[a-check-that-never-went-red-was-never-observed]]. Nothing here is an
instrument, no assertion was vacuous, and there was no check to control. The flag
that lied is production code doing its ordinary job.
