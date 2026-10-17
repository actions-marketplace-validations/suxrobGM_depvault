/**
 * Lossless dotenv model for the Form view. Every line is kept verbatim; only lines whose key or
 * value the user edits are rewritten, reusing their original prefix (`export `), separator
 * spacing and quote style. Line endings and the trailing newline are preserved.
 */

const ENTRY_PATTERN = /^(\s*(?:export\s+)?)([^\s=#]*)(\s*=\s*)(.*)$/;

interface EnvEntry {
  /** Index of the source line, used as a stable row id while editing. */
  line: number;
  key: string;
  /** Value with surrounding matching quotes removed. */
  value: string;
}

export interface EnvDocument {
  lines: string[];
  entries: EnvEntry[];
  eol: "\n" | "\r\n";
}

function isPassiveLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "" || trimmed.startsWith("#");
}

interface UnquotedValue {
  value: string;
  /** The surrounding quote character, or "" when unquoted. */
  quote: string;
}

function unquote(raw: string): UnquotedValue {
  const first = raw[0];
  if (raw.length >= 2 && (first === '"' || first === "'") && raw.endsWith(first)) {
    return { value: raw.slice(1, -1), quote: first };
  }
  return { value: raw, quote: "" };
}

/**
 * Parses dotenv text, or returns null when some line is neither blank, a comment nor
 * `KEY=value` (e.g. multi-line values), in which case only the raw editor is safe.
 */
export function parseEnvDocument(text: string): EnvDocument | null {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const entries: EnvEntry[] = [];

  for (const [index, line] of lines.entries()) {
    if (isPassiveLine(line)) continue;
    const match = ENTRY_PATTERN.exec(line);
    if (!match) return null;
    entries.push({ line: index, key: match[2] ?? "", value: unquote(match[4] ?? "").value });
  }

  return { lines, entries, eol };
}

/** Rewrites one line with a new key and/or value, keeping its prefix, separator and quotes. */
function rewriteLine(line: string, key: string, value: string): string {
  const match = ENTRY_PATTERN.exec(line);
  if (!match) return `${key}=${value}`;
  const [, prefix = "", , separator = "=", rawValue = ""] = match;
  const { quote } = unquote(rawValue);
  return `${prefix}${key}${separator}${quote}${value}${quote}`;
}

export function updateEnvEntry(doc: EnvDocument, line: number, key: string, value: string): string {
  const lines = doc.lines.map((l, i) => (i === line ? rewriteLine(l, key, value) : l));
  return lines.join(doc.eol);
}

export function removeEnvEntry(doc: EnvDocument, line: number): string {
  return doc.lines.filter((_, i) => i !== line).join(doc.eol);
}

/** Appends `=` (an empty pair) before the trailing newline, if the file has one. */
export function appendEnvEntry(doc: EnvDocument): string {
  const lines = [...doc.lines];
  const hasTrailingNewline = lines.length > 1 && lines[lines.length - 1] === "";
  const isEmpty = lines.length === 1 && lines[0] === "";
  if (isEmpty) return "=";
  if (hasTrailingNewline) lines.splice(lines.length - 1, 0, "=");
  else lines.push("=");
  return lines.join(doc.eol);
}
