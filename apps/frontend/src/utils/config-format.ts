import type { ConfigFormat } from "@depvault/shared/constants";

export const CONFIG_FILE_ACCEPT = ".env,.txt,.json,.yaml,.yml,.toml";

/** Detects the config format from a file name's extension, or null if unknown. */
export function detectFormatFromExtension(fileName: string): ConfigFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".json")) return "appsettings.json";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "secrets.yaml";
  if (lower.endsWith(".toml")) return "config.toml";
  if (lower.endsWith(".env") || lower.startsWith(".env")) return "env";
  return null;
}
