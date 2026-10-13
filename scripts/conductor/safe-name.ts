/** Ids, sessions, projects and conductor names go into file paths and a command line: letters, digits, . _ - only, never "..". */
export function isSafeName(value: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(value) && !value.includes("..");
}
