/** A ClickUp id (alphanumeric) or a custom id such as DGS-343. Nothing else goes into a request path. */
export const REF = /^[A-Za-z0-9]+(-\d+)?$/;
/** A custom id such as DGS-343. */
export const KEY = /^[A-Za-z]+-\d+$/;
