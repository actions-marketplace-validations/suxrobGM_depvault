/** Format-agnostic heuristics that flag values likely to be secrets. */

/** Key names that hold a secret whatever the value looks like. */
const KEY_NAME_RE =
  /secret|token|password|passwd|api[_-]?key|private[_-]?key|client[_-]?secret|access[_-]?key/i;

/** Known credential shapes: provider token prefixes, JWTs and PEM private keys. */
export const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/,
  /sk_[a-z]+_[A-Za-z0-9]{8,}/,
  /pk_[a-z]+_[A-Za-z0-9]{8,}/,
  /GOCSPX-[A-Za-z0-9_-]{10,}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /AIza[0-9A-Za-z_-]{35}/,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
];

const NON_SECRET_LITERALS = new Set(["true", "false", "null", "undefined", "localhost", "none"]);

/** Credential markers inside a larger value, such as a connection string. */
const EMBEDDED_SECRET_RE =
  /(?:password|passwd|pwd|secret|api[_-]?key|account[_-]?key|access[_-]?key)\s*=/i;

/** A URI with inline `scheme://user:password@host` credentials. */
const URI_CREDENTIALS_RE = /^[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i;

/** Shannon entropy in bits per char. High values suggest a random credential. */
export function shannonEntropy(value: string): number {
  if (!value) return 0;
  const freq = new Map<string, number>();
  for (const ch of value) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }

  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Whether a value looks like a secret. Checks, in order: obvious non-secrets, the
 * key name, embedded credentials, known token shapes, then high entropy. Returns
 * only a boolean and never logs or echoes the value.
 */
export function looksLikeSecret(value: string, key?: string): boolean {
  const v = value.trim().replace(/^["']|["']$/g, "");
  if (v === "" || NON_SECRET_LITERALS.has(v.toLowerCase())) return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return false;
  if (/^https?:\/\//i.test(v) && !v.includes("@")) return false;

  if (key && KEY_NAME_RE.test(key)) return true;
  if (EMBEDDED_SECRET_RE.test(v) || URI_CREDENTIALS_RE.test(v)) return true;
  if (SECRET_PATTERNS.some((re) => re.test(v))) return true;

  return v.length >= 20 && /^[A-Za-z0-9+/=_-]+$/.test(v) && shannonEntropy(v) > 3.5;
}
