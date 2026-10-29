import type { DependencyStatus, LicensePolicy, Vulnerability } from "@/generated/prisma";

interface Dependency {
  status: DependencyStatus;
  licensePolicy: LicensePolicy;
  vulnerabilities: Pick<Vulnerability, "severity">[];
}

/**
 * Scores project health from 100 down, deducting for dependency status and vulnerability severity.
 * @returns A score clamped to 0–100, or null when there are no dependencies
 */
export function calculateHealthScore(dependencies: Dependency[]): number | null {
  if (dependencies.length === 0) {
    return null;
  }

  let score = 100;
  for (const dep of dependencies) {
    if (dep.status === "MAJOR_UPDATE") score -= 5;
    else if (dep.status === "MINOR_UPDATE") score -= 2;
    else if (dep.status === "DEPRECATED") score -= 10;

    if (dep.licensePolicy === "BLOCK") score -= 10;
    else if (dep.licensePolicy === "WARN") score -= 3;

    for (const vuln of dep.vulnerabilities) {
      if (vuln.severity === "CRITICAL") score -= 15;
      else if (vuln.severity === "HIGH") score -= 10;
      else if (vuln.severity === "MEDIUM") score -= 5;
      else if (vuln.severity === "LOW") score -= 2;
    }
  }

  return Math.max(0, Math.min(100, score));
}
