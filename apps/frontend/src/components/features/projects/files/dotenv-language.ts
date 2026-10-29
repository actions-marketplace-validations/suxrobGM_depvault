import { StreamLanguage } from "@codemirror/language";

interface DotenvState {
  /** True once `=` has been consumed on the current line, so the rest is a value. */
  inValue: boolean;
}

/**
 * Minimal `.env` grammar (CodeMirror ships none): comments, `export`, keys, values, and
 * `$VAR`/`${VAR}` interpolation; unknown input falls back to a string token. Module-level so
 * the editor's `extensions` stay referentially stable.
 */
export const dotenvLanguage = StreamLanguage.define<DotenvState>({
  name: "dotenv",
  startState() {
    return { inValue: false };
  },
  token(stream, state) {
    if (stream.sol()) {
      state.inValue = false;
      stream.eatSpace();
      if (stream.eol()) {
        return null;
      }
    }

    if (state.inValue) {
      if (stream.match(/^\$\{[^}]*\}/) || stream.match(/^\$[A-Za-z_][A-Za-z0-9_]*/)) {
        return "variableName";
      }
      if (stream.match(/^[^$]+/)) {
        return "string";
      }
      stream.next();
      return "string";
    }

    if (stream.peek() === "#") {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/^export\b/)) {
      return "keyword";
    }
    stream.eatSpace();
    if (stream.eat("=")) {
      state.inValue = true;
      return "operator";
    }
    if (stream.match(/^[^=\s#]+/)) {
      return "propertyName";
    }

    stream.next();
    return null;
  },
});
