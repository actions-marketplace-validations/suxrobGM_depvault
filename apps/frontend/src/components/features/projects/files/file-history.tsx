"use client";

import { type ReactElement, useState } from "react";
import { CompareArrows as CompareIcon, Replay as RestoreIcon } from "@mui/icons-material";
import {
  Alert,
  Button,
  Chip,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { client } from "@/api/client";
import { useApiQuery } from "@/api/hooks";
import { queryKeys } from "@/api/query-keys";
import type { RepoFileVersionDto, RepoFileVersionListResponseDto } from "@/api/types/repo-file";
import { useConfirm } from "@/hooks/use-confirm";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDiscard } from "@/hooks/use-unsaved-changes";
import { formatBytes, formatDateTime, formatRelativeTime } from "@/utils/formatters";
import { fetchVersion } from "./fetch-version";
import { useFileChanges } from "./use-file-changes";
import { type ComparePair, VersionCompare } from "./version-compare";

interface FileHistoryProps {
  projectId: string;
  fileId: string;
  canEdit: boolean;
}

/** Version table (newest first) with compare-any-two and restore-as-new-version. */
export function FileHistory(props: FileHistoryProps): ReactElement {
  const { projectId, fileId, canEdit } = props;
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const confirmDiscard = useConfirmDiscard();
  const toast = useToast();
  const [pair, setPair] = useState<ComparePair | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);

  const { data, isLoading, error } = useApiQuery<RepoFileVersionListResponseDto>(
    queryKeys.files.versions(projectId, fileId),
    () => client.api.projects({ id: projectId }).files({ fileId }).versions.get(),
  );

  const changes = useFileChanges(projectId, { successMessage: "Version restored" });

  if (isLoading) return <Skeleton variant="rounded" height={160} />;
  if (error) return <Alert severity="error">Failed to load the version history.</Alert>;

  const versions = data?.items ?? [];
  const current = versions[0];
  if (!current) return <Typography variant="body2Muted">No versions yet.</Typography>;

  const handleRestore = async (version: RepoFileVersionDto) => {
    if (!(await confirmDiscard())) return;
    const ok = await confirm({
      title: `Restore version ${version.version}?`,
      description: `The content of v${version.version} is saved as a new version (v${current.version + 1}). The current path is kept and no history is lost.`,
      confirmLabel: "Restore",
    });
    if (!ok) return;

    setRestoring(version.version);
    const old = await fetchVersion(queryClient, projectId, fileId, version.version).catch(
      () => null,
    );
    if (!old) {
      toast.error(`Failed to load version ${version.version}`);
    } else {
      const restored = await changes.apply({
        changes: [
          {
            fileId,
            baseVersion: current.version,
            content: {
              encryptedContent: old.encryptedContent,
              iv: old.iv,
              authTag: old.authTag,
              contentHash: old.contentHash,
              fileSize: old.fileSize,
              isBinary: old.isBinary,
            },
          },
        ],
        message: `Restored version ${version.version}`,
      });
      if (restored) setPair(null);
    }
    setRestoring(null);
  };

  return (
    <Stack spacing={2}>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Version</TableCell>
              <TableCell>Author</TableCell>
              <TableCell>Message</TableCell>
              <TableCell>When</TableCell>
              <TableCell>Size</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {versions.map((version, index) => {
              const older = versions[index + 1];
              const renamedFrom = older && older.path !== version.path ? older.path : null;
              const isCurrent = index === 0;
              return (
                <TableRow key={version.version} selected={pair?.base === version.version}>
                  <TableCell>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Typography variant="mono">v{version.version}</Typography>
                      {isCurrent && <Chip size="small" label="current" variant="outlined" />}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{version.changedBy.name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2Muted">{version.message || "—"}</Typography>
                    {renamedFrom && (
                      <Typography variant="captionMuted" sx={{ display: "block" }}>
                        Renamed from <code>{renamedFrom}</code>
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Tooltip title={formatDateTime(version.createdAt)}>
                      <Typography variant="body2Muted">
                        {formatRelativeTime(version.createdAt)}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2Muted">{formatBytes(version.fileSize)}</Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    {!isCurrent && (
                      <Button
                        size="small"
                        startIcon={<CompareIcon fontSize="small" />}
                        onClick={() => setPair({ base: version.version, target: current.version })}
                      >
                        Compare
                      </Button>
                    )}
                    {canEdit && !isCurrent && (
                      <Button
                        size="small"
                        startIcon={<RestoreIcon fontSize="small" />}
                        disabled={restoring !== null}
                        onClick={() => handleRestore(version)}
                      >
                        {restoring === version.version ? "Restoring…" : "Restore"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {versions.length === 1 && (
        <Typography variant="body2Muted">This file has a single version so far.</Typography>
      )}

      {pair && (
        <VersionCompare
          projectId={projectId}
          fileId={fileId}
          versions={versions}
          pair={pair}
          onPairChange={setPair}
        />
      )}
    </Stack>
  );
}
