import { parseJsonManifest } from "./json-manifest";
import type { DependencyParser } from "./types";

export const nodejsParser: DependencyParser = {
  canParse(fileName: string): boolean {
    return fileName.toLowerCase() === "package.json";
  },

  parse: (content, fileName) =>
    parseJsonManifest(content, fileName, "package.json", ["dependencies", "devDependencies"]),
};
