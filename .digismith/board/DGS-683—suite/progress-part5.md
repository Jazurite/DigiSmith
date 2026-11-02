# progress DGS-683 part 5

- T17 built 4c9995af, review pack task-17-r1 written (22:2x UTC+7)
- T17 r1: approved, 3 Minor. F2 fixed + F3 test (fix commit), F1 parked: plan says atomic rename only; one driver per ticket by design. r2 pack written.
- T17 r2 approved; F4 fixed (two lines). T18 built, pack task-18-r1 written.
- T18 r1 approved (3 Minor + 2 controller items): fixed in e1170002f435af42bbd8007af43293c0762cac02; r2 pack written.
- T18 r2 approved + 2 minors fixed (ride in T19 pack). T19 built 6d96b9e740c52293973c5a8c097ae3a891630eec, pack task-19-r1 written.
- T19 r1 approved, 2 minors fixed (f7e56170). T20 built 49323cbdb9094091685ef90062c904a659292ada, pack task-20-r1 written.
- T20 r1 approved, 3 minors fixed (2e64f98c). T21 built 4bc6c31ca78ab23397606dc294b9ae0630703278, pack task-21-r1 written. Known failing base test: run/index.test.ts 'list hides runs idle'.
- T21 r1 approved, 2 minors fixed (509e9c01168fb27e0394ac20fc538c300aebe6d3). ticket-final-r1 pack written; protected paths untouched.
- Ticket-final r1 APPROVED (0 Critical, 0 Important, 2 Minor). F1 close.ts release-then-remove partial failure: PARKED (rare; `dg conductor sweep` shows it). F2 start-ticket putEntry overwrites a stale entry: README note, no code. README also notes handover does not check --to is a registry conductor.
- Parked from T17 r1: F1 handover/release race between two processes (plan: atomic rename only; one driver per ticket by design).
- Known base failure, not part 5: run/index.test.ts "list hides runs idle for more than 7 days".
