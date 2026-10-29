"use client";

import { type ReactElement, useState } from "react";
import { Add as AddIcon, Code as CodeIcon } from "@mui/icons-material";
import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TableCell,
  TableRow,
  Typography,
} from "@mui/material";
import { useCiTokens, useRevokeCiToken } from "@/api/queries/project-access";
import { RevokeButton, SectionTable } from "@/components/ui/data-display";
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

  const [createOpen, setCreateOpen] = useState(false);
  const [snippetsOpen, setSnippetsOpen] = useState(false);

  const { data, isLoading } = useCiTokens(projectId);
  const revokeMutation = useRevokeCiToken(projectId);

  const tokens = data?.items ?? [];

  return (
    <>
      <SectionTable
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
        columns={[
          { label: "Name" },
          { label: "Token" },
          { label: "Files" },
          { label: "Expires" },
          { label: "Last Used" },
          { label: "Status" },
          canEdit && { label: "Actions", align: "right" },
        ]}
        isLoading={isLoading}
        isEmpty={tokens.length === 0}
        emptyText="No CI/CD tokens yet. Generate one to get started."
      >
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
                <Typography variant="body2">{formatDateTime(token.lastUsedAt)}</Typography>
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
                  <RevokeButton
                    label={`Revoke ${token.name}`}
                    confirmTitle="Revoke CI Token"
                    confirmDescription={`Are you sure you want to revoke "${token.name}"? Any pipelines using this token will immediately lose access.`}
                    disabled={revokeMutation.isPending}
                    onConfirm={() => revokeMutation.mutate(token.id)}
                  />
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </SectionTable>
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
