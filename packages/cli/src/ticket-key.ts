// The one ticket-key pattern. skills/finishing-a-development-branch/scripts/post-merge-cleanup.ts cannot import this
// package, so it keeps a copy of both patterns: change them together.
/** A full ticket key, e.g. DGS-585 or AB2-5. */
export const TICKET_KEY = /^[A-Z][A-Z0-9]*-\d+$/;
/** The key at the start of a branch name: `<KEY>__slug`. Group 1 is the key. */
export const BRANCH_KEY_PREFIX = /^([A-Z][A-Z0-9]*-\d+)__/;
