import { describe, expect, it } from "vitest";
import { appendEnvEntry, parseEnvDocument, removeEnvEntry, updateEnvEntry } from "./env-lines";

const SAMPLE = '# db\nexport DB_HOST = localhost\n\nAPI_KEY="abc def"\nEMPTY=\n';

describe("parseEnvDocument", () => {
  it("extracts entries without quotes and skips comments and blank lines", () => {
    const doc = parseEnvDocument(SAMPLE);
    expect(doc?.entries.map((e) => [e.key, e.value])).toEqual([
      ["DB_HOST", "localhost"],
      ["API_KEY", "abc def"],
      ["EMPTY", ""],
    ]);
  });

  it("returns null for lines the form cannot represent", () => {
    expect(parseEnvDocument('KEY="multi\nline"')).toBeNull();
  });
});

describe("updateEnvEntry", () => {
  it("only rewrites the edited line, keeping prefix, spacing, quotes and the trailing newline", () => {
    const doc = parseEnvDocument(SAMPLE)!;
    const apiKey = doc.entries[1]!;
    const next = updateEnvEntry(doc, apiKey.line, "API_KEY", "xyz");
    expect(next).toBe('# db\nexport DB_HOST = localhost\n\nAPI_KEY="xyz"\nEMPTY=\n');

    const host = doc.entries[0]!;
    expect(updateEnvEntry(doc, host.line, "DB_HOST", "db")).toContain("export DB_HOST = db\n");
  });

  it("is a no-op round trip when nothing changes, including CRLF files", () => {
    const crlf = "A=1\r\nB='2'\r\n";
    const doc = parseEnvDocument(crlf)!;
    expect(updateEnvEntry(doc, 1, "B", "2")).toBe(crlf);
  });
});

describe("removeEnvEntry / appendEnvEntry", () => {
  it("removes exactly one line", () => {
    const doc = parseEnvDocument("A=1\nB=2\n")!;
    expect(removeEnvEntry(doc, 0)).toBe("B=2\n");
  });

  it("appends a new pair before the trailing newline", () => {
    expect(appendEnvEntry(parseEnvDocument("A=1\n")!)).toBe("A=1\n=\n");
    expect(appendEnvEntry(parseEnvDocument("A=1")!)).toBe("A=1\n=");
    expect(appendEnvEntry(parseEnvDocument("")!)).toBe("=");
  });
});
