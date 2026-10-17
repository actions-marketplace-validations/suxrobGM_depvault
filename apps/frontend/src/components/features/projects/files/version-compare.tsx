"use client";

import { type ReactElement, useEffect, useState } from "react";
import { Alert, Skeleton, Stack, Typography } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import type { RepoFileVersionDto } from "@/api/types/repo-file";
import { SelectField } from "@/components/ui/inputs";
import { useVault } from "@/hooks/use-vault";
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
interface LoadedDiff {
  key: string;
  base: string;
  target: string;
}

interface CompareError {
  key: string;
  message: string;
}

/** Diff between any two versions of a file; both sides are fetched and decrypted on demand. */
export function VersionCompare(props: VersionCompareProps): ReactElement {
  const { projectId, fileId, versions, pair, onPairChange } = props;
  const { getProjectDEK } = useVault();
  const queryClient = useQueryClient();
  const [loaded, setLoaded] = useState<LoadedDiff | null>(null);
  const [error, setError] = useState<CompareError | null>(null);

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
        if (!cancelled) setLoaded({ key: pairKey, base, target });
      })
      .catch(() => {
        if (!cancelled) setError({ key: pairKey, message: "Failed to load these versions." });
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, fileId, pairKey]);

  const diff = loaded?.key === pairKey ? loaded : null;
  const failure = error?.key === pairKey ? error.message : null;

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

      {failure ? (
        <Alert severity="error">{failure}</Alert>
      ) : diff ? (
        <FileDiffViewerLazy
          oldValue={diff.base}
          newValue={diff.target}
          oldTitle={`v${pair.base}`}
          newTitle={`v${pair.target}`}
        />
      ) : (
        <Skeleton variant="rounded" height={200} />
      )}
    </Stack>
  );
}
