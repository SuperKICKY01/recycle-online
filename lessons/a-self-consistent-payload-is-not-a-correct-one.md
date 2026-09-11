# A self-consistent payload is not a correct one — a checksum binds it to itself, not to the truth

**Applies to** every artefact that carries its own checksum or is validated by
parsing its own structure — a QR payload with a CRC, a self-describing TLV record,
a barcode, a message with an embedded digest, a file that ends in a hash of itself.
Two claims look identical and are not: that the artefact is SELF-CONSISTENT (it
parses cleanly and its checksum recomputes) and that it is CORRECT (its content —
the payee, the amount, the account — is what it should be). A proof in this
repository can establish the first. Only an external authority can establish the
second.

**The rule.** A checksum binds a payload to ITSELF, not to the truth. Recomputing
it proves the bytes were not corrupted after they were written; it says nothing
about whether the RIGHT bytes were written. So for any checksummed or
self-describing payload: (1) assert the CONTENT VALUES — payee, amount — against an
INDEPENDENT source of truth (the spec, a hand-derived expectation), never against
the payload's own structural validity or its checksum; and (2) know that
correctness of the FORMAT against the real world is verified OUTSIDE the repository
(a bank scan, the receiving system's own answer), and mark the artefact UNVERIFIED
until that has happened. "It parses and the CRC checks out" is the most convincing
green available, and it is not a claim about correctness.

**Measured 2026-09-10** (STRUCTURE.md § 12 unit 4 commit 3, the PromptPay payload).
`provePromptPay` was re-run with `mobileProxy` deliberately broken — `"0066" + …`
changed to `"66" + …`, producing a WRONG payee proxy (11 digits, the wrong
international form). The two cells asserting the proxy VALUE went red
(`66812345678`, and "not 13 digits"), and **the CRC cell STAYED GREEN**: the
function had computed a perfectly valid CRC over its own wrong body, and an
independent parser consumed the payload cleanly and fully. A proof that asserted
only "the payload parses and the CRC recomputes" would have been entirely green
over a QR that pays the wrong person. The owner's own framing of why this is the
worst outcome, VERBATIM: "QR ที่แอปธนาคารปฏิเสธคือเสมียนที่จ่ายเงินไม่ได้ QR ที่แอปธนาคารรับแต่จ่ายผิดคนแย่กว่านั้น".

**Why the existing lessons do not reach it.**

- [[a-checker-must-not-share-the-code-it-checks]] is about the CHECKER sharing the
  code under test. Here the checker shares nothing — the proof's CRC and parser are
  independent implementations — and the trap is one level out: the ARTEFACT
  validates ITSELF, so a correct, independent structural check still says nothing
  about the content.
- [[a-value-comparison-cannot-prove-a-path]] is about a value proving a ROUTE. Here
  a value (the CRC) proving CONSISTENCY does not prove CORRECTNESS — the same shape,
  one axis over.
- The never-went-red family ([[a-check-that-never-went-red-was-never-observed]]) is
  about assertions that cannot fire. These CAN fire — the disproof proved the value
  cells move. The lesson is not that a cell is vacuous but that a STRUCTURAL /
  CHECKSUM instrument was asked a CONTENT question it cannot answer.

**How to apply.**

1. For any checksummed or self-describing payload, assert the content VALUES
   (payee, amount, id) against a spec-derived expectation, in their own cells. A
   structural or checksum cell is never a substitute — break the content on purpose
   and confirm a CONTENT cell, not the checksum cell, is what reddens.
2. Verify FORMAT correctness against the real receiving authority (the bank, the
   downstream system), never against your own parser. Mark the artefact UNVERIFIED
   in the code and the phase record until that has happened.
3. When you break something to disprove a cell, name which cell you expect to move
   and check THAT cell: a wrong-content break that leaves the checksum cell green is
   the finding, not a failure of the break ([[a-check-that-never-went-red-was-never-observed]],
   its "name the cell you expect to move BEFORE running the break").

**Two homes, one test.** A LESSON, not a machine footgun: a checksum binding a
payload to itself is true of CRCs, HMACs and digests on every machine, and a
session on any box would relearn it. Nothing here is a property of this box.

**Bounds.** Measured once, on one payload, with one deliberate break. The mechanism
— a valid checksum over wrong content, indistinguishable from correct by any
structural test — is general, and carries the lesson.
