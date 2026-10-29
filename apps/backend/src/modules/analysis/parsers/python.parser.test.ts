import { describe, expect, it } from "bun:test";
import { pythonParser } from "./python.parser";

/** Parses and returns `name@version` pairs for compact assertions. */
const parsed = (content: string, fileName: string) =>
  pythonParser.parse(content, fileName).dependencies.map((d) => `${d.name}@${d.version}`);

describe("pythonParser", () => {
  describe("canParse", () => {
    it.each([
      ["requirements.txt", true],
      ["pyproject.toml", true],
      ["setup.py", false],
      ["package.json", false],
    ])("should return %p for %s", (fileName, expected) => {
      expect(pythonParser.canParse(fileName)).toBe(expected);
    });
  });

  describe("parse - requirements.txt", () => {
    it("should mark dependencies as direct and keep the file name", () => {
      const result = pythonParser.parse("flask==2.3.2", "requirements.txt");

      expect(result).toEqual({
        fileName: "requirements.txt",
        dependencies: [{ name: "flask", version: "==2.3.2", isDirect: true }],
      });
    });

    it.each([
      [
        "version specifiers",
        "flask==2.3.2\nrequests>=2.28.0\nnumpy~=1.24.0\npandas!=1.5.0\nscipy<=1.11.0",
        [
          "flask@==2.3.2",
          "requests@>=2.28.0",
          "numpy@~=1.24.0",
          "pandas@!=1.5.0",
          "scipy@<=1.11.0",
        ],
      ],
      ["compound specifiers", "flask>=2.0.0,<3.0.0", ["flask@>=2.0.0,<3.0.0"]],
      ["no specifier as *", "flask\nrequests\n", ["flask@*", "requests@*"]],
      [
        "comments, inline comments, and blank lines",
        "# comment\n\nflask==2.3.2  # web\n  # another\nrequests>=2.28.0 # http",
        ["flask@==2.3.2", "requests@>=2.28.0"],
      ],
      [
        "include and index flags skipped",
        "-r base.txt\n--index-url https://pypi.org/simple\n-e git+https://github.com/u/r.git\n-f https://x\n--extra-index-url https://y\nflask==2.3.2",
        ["flask@==2.3.2"],
      ],
      [
        "URLs and paths skipped",
        "https://example.com/p.whl\n./local-package\n/absolute/path\nflask==2.3.2",
        ["flask@==2.3.2"],
      ],
      ["environment markers dropped", 'pywin32>=300; sys_platform == "win32"', ["pywin32@>=300"]],
      [
        "extras dropped",
        "requests[security]>=2.28.0\ncelery[redis]==5.3.0",
        ["requests@>=2.28.0", "celery@==5.3.0"],
      ],
      [
        "names normalized",
        "My_Package==1.0.0\nAnother.Package>=2.0",
        ["my-package@==1.0.0", "another-package@>=2.0"],
      ],
      [
        "Windows line endings",
        "flask==2.3.2\r\nrequests>=2.28.0\r\n",
        ["flask@==2.3.2", "requests@>=2.28.0"],
      ],
      ["an empty file", "", []],
    ])("should handle %s", (_, content, expected) => {
      expect(parsed(content, "requirements.txt")).toEqual(expected);
    });
  });

  describe("parse - pyproject.toml", () => {
    const project = (...lines: string[]) => ["[project]", 'name = "demo"', ...lines].join("\n");

    it.each([
      [
        "a multi-line dependencies array",
        project(
          "dependencies = [",
          '  "flask>=2.3.0",',
          '  "requests~=2.28.0",',
          '  "pydantic==2.0.0",',
          "]",
        ),
        ["flask@>=2.3.0", "requests@~=2.28.0", "pydantic@==2.0.0"],
      ],
      [
        "a single-line array",
        project('dependencies = ["flask>=2.3.0", "requests>=2.28.0"]'),
        ["flask@>=2.3.0", "requests@>=2.28.0"],
      ],
      [
        "single-quoted strings",
        project("dependencies = [", "  'flask>=2.3.0',", "]"),
        ["flask@>=2.3.0"],
      ],
      ["no versions as *", project("dependencies = [", '  "flask",', "]"), ["flask@*"]],
      ["an empty array", project("dependencies = []"), []],
      [
        "environment markers dropped",
        project("dependencies = [", '  "pywin32>=300; sys_platform == \\"win32\\"",', "]"),
        ["pywin32@>=300"],
      ],
      [
        "extras dropped",
        project("dependencies = [", '  "requests[security]>=2.28.0",', "]"),
        ["requests@>=2.28.0"],
      ],
      [
        "other sections ignored",
        [
          "[build-system]",
          'requires = ["setuptools>=64"]',
          project("dependencies = [", '  "flask>=2.3.0",', "]"),
          "[tool.pytest]",
          "testpaths = ['tests']",
        ].join("\n"),
        ["flask@>=2.3.0"],
      ],
      ["no [project] section", '[build-system]\nrequires = ["setuptools"]', []],
    ])("should handle %s", (_, content, expected) => {
      expect(parsed(content, "pyproject.toml")).toEqual(expected);
    });
  });
});
