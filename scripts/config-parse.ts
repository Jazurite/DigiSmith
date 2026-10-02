export type ConfigValue = string | string[];

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export type ConfigEntry = { key: string; line: number; lastLine: number; comment: string; isArray: boolean };
export type ConfigSection = { name: string; line: number; lastLine: number };
export type ConfigDocument = {
  lines: string[];
  values: Map<string, ConfigValue>;
  entries: Map<string, ConfigEntry>;
  sections: Map<string, ConfigSection>;
};

export const KEY_PATTERN = /^[a-z0-9_]+$/;

export function splitConfigLines(text: string): string[] {
  const body = text.startsWith("\ufeff") ? text.slice(1) : text;
  const lines = body.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

type Scalar = { value: string; quoted: boolean; comment: string };

function parseScalar(raw: string, err: (reason: string) => ConfigError): Scalar {
  if (raw !== "" && raw[0] !== " ") throw err("expected a space after ':' or '-'");
  const s = raw.trimStart();
  if (s.startsWith('"') || s.startsWith("'")) {
    const end = s.indexOf(s[0], 1);
    if (end === -1) throw err("missing closing quote");
    const after = s.slice(end + 1);
    if (after.trim() !== "" && !/^\s+#/.test(after)) throw err("text after the closing quote");
    return { value: s.slice(1, end), quoted: true, comment: after.includes("#") ? after : "" };
  }
  if (s.startsWith("#")) return { value: "", quoted: false, comment: s };
  const hash = s.indexOf(" #");
  const value = (hash === -1 ? s : s.slice(0, hash)).trimEnd();
  if (/^[[{]/.test(value)) throw err("flow syntax ([...] or {...}) is not supported");
  if (/^[|>][-+0-9]*$/.test(value)) throw err("block scalars (| or >) are not supported");
  return { value, quoted: false, comment: hash === -1 ? "" : s.slice(value.length) };
}

export function parseConfigDocument(text: string, label = "config.yml"): ConfigDocument {
  const lines = splitConfigLines(text);
  const values = new Map<string, ConfigValue>();
  const entries = new Map<string, ConfigEntry>();
  const sections = new Map<string, ConfigSection>();
  const topNames = new Set<string>();
  let section: ConfigSection | null = null;
  let array: { entry: ConfigEntry; itemIndent: number } | null = null;
  let pending: { key: string; name: string; line: number; level: 0 | 1 } | null = null;
  const errAt = (index: number, reason: string) => new ConfigError(`${label} line ${index + 1}: ${reason}`);
  const emptyOpener = (p: { name: string; line: number }) =>
    errAt(p.line, `'${p.name}:' has no value and no indented lines under it`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const err = (reason: string) => errAt(i, reason);
    const indent = line.length - line.trimStart().length;
    if (line.slice(0, indent).includes("\t")) throw err("tab in indentation; use spaces");
    const content = line.slice(indent);
    const isItem = content === "-" || content.startsWith("- ");

    if (pending) {
      const childIndent = pending.level === 0 ? 2 : 4;
      if (indent === childIndent && isItem) {
        const entry: ConfigEntry = { key: pending.key, line: pending.line, lastLine: pending.line, comment: "", isArray: true };
        entries.set(pending.key, entry);
        values.set(pending.key, []);
        array = { entry, itemIndent: childIndent };
      } else if (indent === childIndent && pending.level === 0) {
        section = { name: pending.name, line: pending.line, lastLine: pending.line };
        sections.set(pending.name, section);
      } else if (indent === childIndent) {
        throw err("a second level of headings is not supported");
      } else if (indent < childIndent && isItem) {
        throw err(`array items must be indented ${childIndent} spaces`);
      } else if (indent < childIndent) {
        throw emptyOpener(pending);
      } else {
        throw err(`expected an indent of ${childIndent} spaces`);
      }
      pending = null;
    }

    if (isItem) {
      if (!array) throw err("array item with no array key above it");
      if (indent !== array.itemIndent) throw err(`array items must be indented ${array.itemIndent} spaces`);
      const item = parseScalar(content.slice(1), err);
      if (!item.quoted && item.value === "") throw err("empty array item");
      (values.get(array.entry.key) as string[]).push(item.value);
      array.entry.lastLine = i;
      if (section && array.entry.key.startsWith(`${section.name}.`)) section.lastLine = i;
      continue;
    }

    array = null;
    const colon = content.indexOf(":");
    if (colon === -1) throw err("expected 'key: value'");
    const name = content.slice(0, colon);
    if (!KEY_PATTERN.test(name)) throw err(`invalid key '${name}' (use a-z, 0-9 and _)`);
    const scalar = parseScalar(content.slice(colon + 1), err);
    let key: string;
    let level: 0 | 1;
    if (indent === 0) {
      section = null;
      if (topNames.has(name)) throw err(`duplicate key '${name}'`);
      topNames.add(name);
      key = name;
      level = 0;
    } else if (indent === 2) {
      if (!section) throw err("indented line with no heading above it");
      key = `${section.name}.${name}`;
      if (entries.has(key)) throw err(`duplicate key '${key}'`);
      section.lastLine = i;
      level = 1;
    } else {
      throw err("keys must be indented 0 or 2 spaces");
    }
    if (!scalar.quoted && scalar.value === "") {
      pending = { key, name, line: i, level };
      continue;
    }
    values.set(key, scalar.value);
    entries.set(key, { key, line: i, lastLine: i, comment: scalar.comment, isArray: false });
  }
  if (pending) throw emptyOpener(pending);
  return { lines, values, entries, sections };
}

export function parseConfig(text: string, label = "config.yml"): Map<string, ConfigValue> {
  return parseConfigDocument(text, label).values;
}
