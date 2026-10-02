import { ConfigError, KEY_PATTERN, parseConfigDocument } from "./config-parse.ts";

export const HEADER = "# DigiSmith config for this checkout. Edit by hand or through digismith:preferences.";

export function splitKey(key: string): { section: string | null; name: string } {
  const parts = key.split(".");
  if (parts.length > 2 || !parts.every((part) => KEY_PATTERN.test(part))) {
    throw new ConfigError(`invalid key '${key}'`);
  }
  return parts.length === 2 ? { section: parts[0], name: parts[1] } : { section: null, name: parts[0] };
}

// Quote only when a plain value would read back differently: empty, padded,
// or starting with a character the parser treats as syntax.
export function formatScalar(value: string): string {
  if (/[\r\n]/.test(value)) throw new ConfigError("a value cannot contain a line break");
  const needsQuotes = value === "" || value !== value.trim() || /^["'#[{|>]/.test(value) || value.includes(" #");
  if (!needsQuotes) return value;
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  throw new ConfigError(`the value contains both quote types and cannot be written: ${value}`);
}

function joinLines(lines: string[]): string {
  const out = [...lines];
  while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
  return out.join("\n") + "\n";
}

export function setInText(text: string, key: string, value: string, label = "config.yml"): string {
  const { section, name } = splitKey(key);
  const formatted = formatScalar(value);
  const doc = parseConfigDocument(text, label);
  const lines = doc.lines.every((line) => line.trim() === "") ? [HEADER] : [...doc.lines];

  const entry = doc.entries.get(key);
  if (entry) {
    if (entry.isArray) throw new ConfigError(`'${key}' is an array; edit it by hand`);
    lines[entry.line] = `${section ? "  " : ""}${name}: ${formatted}${entry.comment}`;
    return joinLines(lines);
  }

  if (section === null) {
    if (doc.sections.has(name)) throw new ConfigError(`'${key}' is a heading, not a key`);
    const keyLine = `${name}: ${formatted}`;
    const topEntries = [...doc.entries.values()].filter((e) => !e.key.includes("."));
    if (topEntries.length > 0) {
      lines.splice(Math.max(...topEntries.map((e) => e.lastLine)) + 1, 0, keyLine);
    } else if (doc.sections.size > 0) {
      lines.splice(Math.min(...[...doc.sections.values()].map((s) => s.line)), 0, keyLine, "");
    } else {
      lines.push(keyLine);
    }
    return joinLines(lines);
  }

  if (doc.entries.has(section)) throw new ConfigError(`'${section}' is a key, not a heading`);
  const keyLine = `  ${name}: ${formatted}`;
  const existing = doc.sections.get(section);
  if (existing) {
    lines.splice(existing.lastLine + 1, 0, keyLine);
    return joinLines(lines);
  }
  if (lines[lines.length - 1].trim() !== "") lines.push("");
  lines.push(`${section}:`, keyLine);
  return joinLines(lines);
}

export function clearInText(text: string, key: string, label = "config.yml"): string {
  const { section } = splitKey(key);
  const doc = parseConfigDocument(text, label);
  const entry = doc.entries.get(key);
  if (!entry) return text;
  const lines = [...doc.lines];
  if (entry.isArray) {
    const itemIndent = section === null ? 2 : 4;
    const itemPrefix = " ".repeat(itemIndent) + "-";
    for (let i = entry.lastLine; i >= entry.line; i--) {
      if (i === entry.line || lines[i].startsWith(itemPrefix)) lines.splice(i, 1);
    }
  } else {
    lines.splice(entry.line, entry.lastLine - entry.line + 1);
  }
  const heading = section === null ? undefined : doc.sections.get(section);
  const lastInSection = heading && ![...doc.entries.keys()].some((k) => k !== key && k.startsWith(`${section}.`));
  if (heading && lastInSection) {
    const blankAbove = heading.line > 0 && lines[heading.line - 1].trim() === "";
    lines.splice(blankAbove ? heading.line - 1 : heading.line, blankAbove ? 2 : 1);
  }
  return joinLines(lines);
}
