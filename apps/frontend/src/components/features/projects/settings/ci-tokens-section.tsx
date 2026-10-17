"use client";

import { type ReactElement, useState } from "react";
import { Add as AddIcon, Code as CodeIcon, Delete as DeleteIcon } from "@mui/icons-material";
import {
  Button,
  CardContent,
  CardHeader,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
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
import { client } from "@/api/client";
import { useApiMutation, useApiQuery } from "@/api/hooks";
import { queryKeys } from "@/api/query-keys";
import type { CiTokenDto, CiTokenListResponseDto } from "@/api/types/ci-token";
import { Surface } from "@/components/ui/cards";
import { useConfirm } from "@/hooks/use-confirm";
import { formatDateTime } from "@/utils/formatters";
import { CiTokenUsageSnippets } from "./ci-token-usage-snippets";
import { CreateCiTokenDialog } from "./create-ci-token-dialog";

interface CiTokensSectionProps {
  projectId: string;
  canEdit: boolean;
  isOwner: boolean;
}

export function CiTokensSection(props: CiTokensSectionProps): ReactElement {
  const { projectId, canEdit, isOwner } = props;
  const confirm = useConfirm();

  const [createOpen, setCreateOpen] = useState(false);
  const [snippetsOpen, setSnippetsOpen] = useState(false);

  const { data } = useApiQuery<CiTokenListResponseDto>(
    queryKeys.ciTokens.byProject(projectId),
    () =>
      client.api.projects({ id: projectId })["ci-tokens"].get({ query: { page: 1, limit: 100 } }),
  );

  const revokeMutation = useApiMutation(
    (tokenId: string) => client.api.projects({ id: projectId })["ci-tokens"]({ tokenId }).delete(),
    {
      invalidateKeys: [queryKeys.ciTokens.byProject(projectId)],
      successMessage: "CI token revoked",
      errorMessage: "Failed to revoke token",
    },
  );

  const tokens = data?.items ?? [];

  const revokeToken = async (token: CiTokenDto) => {
    const ok = await confirm({
      title: "Revoke CI Token",
      description: `Are you sure you want to revoke "${token.name}"? Any pipelines using this token will immediately lose access.`,
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (ok) revokeMutation.mutate(token.id);
  };

  return (
    <>
      <Surface>
        <CardHeader
          title="CI/CD Tokens"
          subheader="Tokens let CI pipelines run depvault pull to fetch and decrypt files at build time."
          action={
            <Stack direction="row" spacing={1}>
              <Button size="small" startIcon={<CodeIcon />} onClick={() => setSnippetsOpen(true)}>
                CI setup
              </Button>
              {canEdit && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setCreateOpen(true)}
                >
                  Generate Token
                </Button>
              )}
            </Stack>
          }
        />
        <CardContent sx={{ p: 3 }}>
          {tokens.length === 0 ? (
            <Typography variant="body2Muted" sx={{ py: 2, textAlign: "center" }}>
              No CI/CD tokens yet. Generate one to get started.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Token</TableCell>
                    <TableCell>Files</TableCell>
                    <TableCell>Expires</TableCell>
                    <TableCell>Last Used</TableCell>
                    <TableCell>Status</TableCell>
                    {canEdit && <TableCell align="right">Actions</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tokens.map((token) => {
                    const expired = new Date(token.expiresAt) < new Date();
                    return (
                      <TableRow key={token.id}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {token.name}
                          </Typography>
                          <Typography variant="captionMuted">{token.createdByEmail}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2Muted" sx={{ fontFamily: "monospace" }}>
                            dvci_{token.tokenPrefix}...
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {token.paths.length === 0 ? (
                            <Typography variant="body2">All files</Typography>
                          ) : (
                            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
                              {token.paths.map((glob) => (
                                <Chip
                                  key={glob}
                                  label={glob}
                                  size="small"
                                  variant="outlined"
                                  sx={{ fontFamily: "monospace" }}
                                />
                              ))}
                            </Stack>
                          )}
                          {token.ipAllowlist.length > 0 && (
                            <Typography variant="captionMuted" sx={{ display: "block" }}>
                              IPs: {token.ipAllowlist.join(", ")}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{formatDateTime(token.expiresAt)}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {formatDateTime(token.lastUsedAt)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={expired ? "Expired" : "Active"}
                            color={expired ? "warning" : "success"}
                            size="small"
                          />
                        </TableCell>
                        {canEdit && (
                          <TableCell align="right">
                            <Tooltip title="Revoke">
                              <IconButton
                                size="small"
                                aria-label={`Revoke ${token.name}`}
                                disabled={revokeMutation.isPending}
                                onClick={() => revokeToken(token)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Surface>
      {createOpen && (
        <CreateCiTokenDialog
          onClose={() => setCreateOpen(false)}
          projectId={projectId}
          isOwner={isOwner}
        />
      )}
      <Dialog open={snippetsOpen} onClose={() => setSnippetsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Use a token in CI</DialogTitle>
        <DialogContent>
          <CiTokenUsageSnippets />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSnippetsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
