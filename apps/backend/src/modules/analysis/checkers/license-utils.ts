import type { LicensePolicy } from "@/generated/prisma";

interface LicenseRule {
  licenseId: string;
  policy: LicensePolicy;
}

const PERMISSIVE_LICENSES = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "CC0-1.0",
  "Unlicense",
  "BlueOak-1.0.0",
  "CC-BY-4.0",
  "Zlib",
  "PSF-2.0",
  "Python-2.0",
  "BSL-1.0",
]);

/** Default policy: permissive = ALLOW; copyleft and unknown licenses = WARN. */
function defaultPolicy(spdxId: string): LicensePolicy {
  return PERMISSIVE_LICENSES.has(spdxId) ? "ALLOW" : "WARN";
}

/** Resolve license policy using project-specific rules, falling back to defaults */
export function resolveLicensePolicy(
  license: string | null,
  projectRules: LicenseRule[],
): LicensePolicy {
  if (!license) return "WARN";

  const spdxId = license.trim();

  const rule = projectRules.find((r) => r.licenseId.toLowerCase() === spdxId.toLowerCase());
  return rule?.policy ?? defaultPolicy(spdxId);
}
