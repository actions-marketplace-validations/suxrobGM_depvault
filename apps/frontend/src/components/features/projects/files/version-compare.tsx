"use client";

import { type ReactElement, useEffect, useState } from "react";
import { Alert, Skeleton, Stack, Typography } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import type { RepoFileVersionDto } from "@/api/types/repo-file";
import { SelectField } from "@/components/ui/inputs";
import { useVault } from "@/hooks/use-vault";
import { describeKeyError } from "@/lib/crypto/errors";
import { formatBytes } from "@/utils/formatters";
import { FileDiffViewerLazy } from "./code-editor-lazy";
import { fetchVersion } from "./fetch-version";
import { decodeText, decryptFileBytes } from "./file-crypto";

export interface ComparePair {
  base: number;
  target: number;
}

interface VersionCompareProps {
  projectId: string;
  fileId: string;
  versions: RepoFileVersionDto[];
  pair: ComparePair;
  onPairChange: (pair: ComparePair) => void;
}

/** Local view model: both sides of a diff, decrypted client-side. */
interface DiffSides {
  base: string;
  target: string;
}

/** Outcome of loading one version pair, tagged with its key so a stale result is never shown. */
interface CompareResult {
  key: string;
  diff: DiffSides | null;
  error: string | null;
}

/** Diff between any two versions of a file; both sides are fetched and decrypted on demand. */
export function VersionCompare(props: VersionCompareProps): ReactElement {
  const { projectId, fileId, versions, pair, onPairChange } = props;
  const { getProjectDEK } = useVault();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<CompareResult | null>(null);

  const pairKey = `${pair.base}:${pair.target}`;
  const options = versions.map((v, i) => ({
    value: String(v.version),
    label: i === 0 ? `v${v.version} (current)` : `v${v.version}`,
  }));

  useEffect(() => {
    let cancelled = false;

    const loadSide = async (version: number): Promise<string> => {
      const meta = versions.find((v) => v.version === version);
      if (meta?.isBinary) return `Binary file (${formatBytes(meta.fileSize)})`;
      const [content, dek] = await Promise.all([
        fetchVersion(queryClient, projectId, fileId, version),
        getProjectDEK(projectId),
      ]);
      return decodeText(await decryptFileBytes(content, dek)).text;
    };

    Promise.all([loadSide(pair.base), loadSide(pair.target)])
      .then(([base, target]) => {
        if (!cancelled) setResult({ key: pairKey, diff: { base, target }, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const error = describeKeyError(err, "Failed to load these versions.");
          setResult({ key: pairKey, diff: null, error });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, fileId, pairKey]);

  const current = result?.key === pairKey ? result : null;
  const diff = current?.diff ?? null;
  const failure = current?.error ?? null;

  return (
    <Stack spacing={1.5}>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}
      >
        <Typography variant="subtitle2">Compare</Typography>
        <SelectField
          label="From"
          value={String(pair.base)}
          options={options}
          onChange={(value) => onPairChange({ ...pair, base: Number(value) })}
        />
        <SelectField
          label="To"
          value={String(pair.target)}
          options={options}
          onChange={(value) => onPairChange({ ...pair, target: Number(value) })}
        />
      </Stack>

      {failure && <Alert severity="error">{failure}</Alert>}
      {!failure && diff && (
        <FileDiffViewerLazy
          oldValue={diff.base}
          newValue={diff.target}
          oldTitle={`v${pair.base}`}
          newTitle={`v${pair.target}`}
        />
      )}
      {!failure && !diff && <Skeleton variant="rounded" height={200} />}
    </Stack>
  );
}
