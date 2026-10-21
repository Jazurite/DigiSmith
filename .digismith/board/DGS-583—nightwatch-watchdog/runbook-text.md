# Runbook text for DGS-583 (the conductor applies this)

## a. Starting a worker

The worker-start step stays as DGS-581 says. DGS-583 changes nothing there.

## b. Manual runs and phases

When you change the phase of a run by hand, tell the run. The watchdog uses the phase to pick the time budget.

    dg run event <run-id> phase --data '{"phase":"building"}'
    dg run event <run-id> phase --data '{"phase":"review"}'
    dg run event <run-id> phase --data '{"phase":"merge"}'

`<run-id>` and `phase` are arguments. The phase goes in `--data` as JSON. The valid phases are `building`, `review` and `merge`.

## c. What needs Jack

- `dg autonomous attention` lists the open items that need Jack. It prints `none` when there are no items.
- `dg autonomous attention resolve <id>` closes one item by hand. Add `--note "text"` if you want a note.
- `dg autonomous resume` closes the circuit breaker. `dg autonomous back` closes it too. Nothing else closes it, and an away window that ends does not.

## d. Every failed release names a cause

    dg autonomous release --ticket <KEY> --result failed --cause <code>

Use one of these twelve codes. A code that is not in the list is recorded as `unknown`, with a warning.

Transient (a retry may help):

- `gateway-5xx`
- `gateway-timeout`
- `rate-limited`
- `pane-died`
- `tab-lost`

Durable (only a person can fix it):

- `classifier-block`
- `merge-refused`
- `test-red`
- `review-rejected`
- `spec-gap`
- `mandate-deny`

Unknown:

- `unknown`

A classifier block is always `classifier-block`.

## e. The watchdog never answers a prompt

The watchdog only reads. It never sends keys to a pane and never closes one. A `blocked` item means a worker waits for an answer. A person, or the conductor, answers it in the pane. The item closes itself at the next pass after the worker moves on.
