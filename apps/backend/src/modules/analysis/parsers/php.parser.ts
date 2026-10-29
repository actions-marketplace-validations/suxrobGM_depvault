import { parseJsonManifest } from "./json-manifest";
import type { DependencyParser } from "./types";

// PHP platform requirements (php, ext-*, lib-*) aren't installable packages.
const isPlatformRequirement = (name: string) =>
  name === "php" || name.startsWith("ext-") || name.startsWith("lib-");

export const phpParser: DependencyParser = {
  canParse(fileName: string): boolean {
    return fileName.toLowerCase() === "composer.json";
  },

  parse: (content, fileName) =>
    parseJsonManifest(
      content,
      fileName,
      "composer.json",
      ["require", "require-dev"],
      isPlatformRequirement,
    ),
};
