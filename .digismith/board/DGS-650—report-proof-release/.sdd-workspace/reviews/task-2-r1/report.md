### Spec Compliance

- ✅ Spec compliant. `report.ts:52-53` builds `proofs` from `result === "proof"` only, as `KEY: reason` with the reason omitted when empty. `report.ts:81` prints "Proofs" after "Waiting for Jack" and before "Skipped". `report.ts:47` reads `commit unknown (none given at release)` for a merged release with no commit. The `failed` (line 49) and `waiting` (line 51) filters name no `proof`, so a proof is in neither. `stopped` still matches both filters, and the existing test for that stays.

### Strengths
- Minimal change that follows the existing section pattern (same `list()` helper, so an empty section reads `none`).
- Tests assert the real rendered text and slice by section header, so they also prove the section order (Waiting → Proofs → Skipped).
- The no-reason test checks both the key and the absence of a trailing colon.

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
None.

#### Minor (Nice to Have)
- F1 `packages/cli/src/autonomous/report.test.ts:~66`: the tests split the report on the bare word "Proofs". A reason or ticket text containing "Proofs" (or "Skipped") would shift the slice. Fake data here is safe; a heading-anchored split (`\nProofs\n`) would be sturdier.

### Assessment

**Task quality:** Approved

**Reasoning:** The diff does what Task 2 asks with no extra behavior; proof is kept out of Failed and Waiting, and the section order is right. I did not re-run the tests; the reported 27 passing are consistent with the code read.

```json findings
[
  {
    "id": "F1",
    "path": "packages/cli/src/autonomous/report.test.ts",
    "line": 66,
    "severity": "Minor",
    "what": "Section slicing splits on the bare words Proofs, Waiting for Jack and Skipped, not on whole heading lines.",
    "scenario": "A reason that contains the word Proofs or Skipped moves the slice boundary and the test checks the wrong text."
  }
]
```
