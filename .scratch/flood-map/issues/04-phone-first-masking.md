# 04 · Mask phone numbers before house numbers

Status: done
Parent: [`../spec.md`](../spec.md) (Changes to flood-reports; RPT-REQ-005)
Blocked by: none

## What to build
Change the RPT-REQ-005 masking order: phone numbers first, then house numbers. "บ้าน 081 234 5678" becomes "บ้าน ***". Update the RPT-REQ-005 text and its E-case notes in the same commit.

## Acceptance criteria (seam 4: the masking function)
- [ ] "บ้าน 081 234 5678" and "บ้าน 081.234.5678" leave no digits of the phone.
- [ ] The house-number cases from AC7/AC8 still hold.
- [ ] The known-limitation test pinning "*** 234 5678" is replaced.
- [ ] The random-phone property test still passes.
