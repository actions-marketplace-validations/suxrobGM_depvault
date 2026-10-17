"use client";

import type { ReactElement } from "react";
import { Chip, TableCell, TableRow, Tooltip, Typography } from "@mui/material";
import { useRevokeShareLink, useShareLinks } from "@/api/queries/project-access";
import type { ShareLinkDto } from "@/api/types/share-link";
import { RevokeButton, SectionTable } from "@/components/ui/data-display";
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

  const { data, isLoading } = useShareLinks(projectId);
  const revokeMutation = useRevokeShareLink(projectId);

  const links = data?.items ?? [];

  return (
    <SectionTable
      title="Share Links"
      subheader="One-time links to single files. The decryption key lives only in the link itself."
      columns={[
        { label: "File" },
        { label: "Status" },
        { label: "Created" },
        { label: "Expires" },
        { label: "Actions", align: "right" },
      ]}
      isLoading={isLoading}
      isEmpty={links.length === 0}
      emptyText="No share links yet. Create one from a file's actions menu in the Files tab."
    >
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
              <Tooltip title={link.viewedAt ? `Viewed ${formatDateTime(link.viewedAt)}` : ""}>
                <Chip size="small" label={status.label} color={status.color} />
              </Tooltip>
            </TableCell>
            <TableCell>
              <Typography variant="body2Muted">{formatRelativeTime(link.createdAt)}</Typography>
            </TableCell>
            <TableCell>
              <Typography variant="body2Muted">{formatDateTime(link.expiresAt)}</Typography>
            </TableCell>
            <TableCell align="right">
              {link.status === "PENDING" && (
                <RevokeButton
                  label="Revoke share link"
                  confirmTitle="Revoke share link"
                  confirmDescription={`The link for "${link.fileName ?? "this file"}" stops working immediately.`}
                  disabled={revokeMutation.isPending}
                  onConfirm={() => revokeMutation.mutate(link.id)}
                />
              )}
            </TableCell>
          </TableRow>
        );
      })}
    </SectionTable>
  );
}
