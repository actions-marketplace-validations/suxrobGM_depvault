"use client";

import type { ReactElement } from "react";
import { Delete as DeleteIcon } from "@mui/icons-material";
import {
  CardContent,
  CardHeader,
  Chip,
  IconButton,
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
import type { ShareLinkDto, ShareLinkListResponseDto } from "@/api/types/share-link";
import { Surface } from "@/components/ui/cards";
import { useConfirm } from "@/hooks/use-confirm";
import { formatDateTime, formatRelativeTime } from "@/utils/formatters";

interface ShareLinksSectionProps {
  projectId: string;
}

interface StatusChip {
  label: string;
  color: "info" | "success" | "default";
}

const STATUS_CHIP: Record<ShareLinkDto["status"], StatusChip> = {
  PENDING: { label: "Pending", color: "info" },
  VIEWED: { label: "Viewed", color: "success" },
  EXPIRED: { label: "Expired", color: "default" },
};

/** One-time share links created in this project; pending ones can be revoked. */
export function ShareLinksSection(props: ShareLinksSectionProps): ReactElement {
  const { projectId } = props;
  const confirm = useConfirm();

  const { data, isLoading } = useApiQuery<ShareLinkListResponseDto>(
    queryKeys.shareLinks.byProject(projectId),
    () => client.api.projects({ id: projectId }).shares.get(),
    { errorMessage: "Failed to load share links" },
  );

  const revokeMutation = useApiMutation(
    (shareId: string) => client.api.projects({ id: projectId }).shares({ shareId }).delete(),
    {
      invalidateKeys: [queryKeys.shareLinks.byProject(projectId)],
      successMessage: "Share link revoked",
      errorMessage: "Failed to revoke share link",
    },
  );

  const links = data?.items ?? [];

  const handleRevoke = async (link: ShareLinkDto) => {
    const ok = await confirm({
      title: "Revoke share link",
      description: `The link for "${link.fileName ?? "this file"}" stops working immediately.`,
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (ok) revokeMutation.mutate(link.id);
  };

  return (
    <Surface>
      <CardHeader
        title="Share Links"
        subheader="One-time links to single files. The decryption key lives only in the link itself."
      />
      <CardContent sx={{ p: 3 }}>
        {!isLoading && links.length === 0 ? (
          <Typography variant="body2Muted" sx={{ py: 2, textAlign: "center" }}>
            No share links yet. Create one from a file&apos;s actions menu in the Files tab.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>File</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Expires</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {links.map((link) => {
                  const status = STATUS_CHIP[link.status];
                  return (
                    <TableRow key={link.id}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                          {link.fileName ?? "—"}
                        </Typography>
                        {link.hasPassword && (
                          <Typography variant="captionMuted">Password protected</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Tooltip
                          title={link.viewedAt ? `Viewed ${formatDateTime(link.viewedAt)}` : ""}
                        >
                          <Chip size="small" label={status.label} color={status.color} />
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2Muted">
                          {formatRelativeTime(link.createdAt)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2Muted">
                          {formatDateTime(link.expiresAt)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {link.status === "PENDING" && (
                          <Tooltip title="Revoke">
                            <IconButton
                              size="small"
                              aria-label="Revoke share link"
                              disabled={revokeMutation.isPending}
                              onClick={() => handleRevoke(link)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Surface>
  );
}
