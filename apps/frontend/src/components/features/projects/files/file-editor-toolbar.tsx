"use client";

import type { ReactElement } from "react";
import {
  Delete as DeleteIcon,
  Download as DownloadIcon,
  DriveFileMove as MoveIcon,
  Share as ShareIcon,
} from "@mui/icons-material";
import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import type { RepoFileContentDto } from "@/api/types/repo-file";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/inputs";
import { formatBytes, formatDateTime, formatRelativeTime } from "@/utils/formatters";

interface FileEditorToolbarProps {
  content: RepoFileContentDto;
  canEdit: boolean;
  busy: boolean;
  onDownload: () => void;
  onShare: () => void;
  onMove: () => void;
  onDelete: () => void;
}

/** Path, version and size of the open file plus its actions menu. */
export function FileEditorToolbar(props: FileEditorToolbarProps): ReactElement {
  const { content, canEdit, busy, onDownload, onShare, onMove, onDelete } = props;

  const actions: ActionMenuItem[] = [
    {
      label: "Download",
      icon: <DownloadIcon fontSize="small" />,
      onClick: onDownload,
      disabled: busy,
    },
    {
      label: "Share via one-time link",
      icon: <ShareIcon fontSize="small" />,
      onClick: onShare,
      disabled: busy,
      hidden: !canEdit,
    },
    {
      label: "Rename or move",
      icon: <MoveIcon fontSize="small" />,
      onClick: onMove,
      hidden: !canEdit,
    },
    {
      label: "Delete",
      icon: <DeleteIcon fontSize="small" />,
      onClick: onDelete,
      destructive: true,
      hidden: !canEdit,
      dividerBefore: true,
    },
  ];

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
      <Typography
        variant="subtitle1"
        title={content.path}
        noWrap
        sx={{ fontFamily: "monospace", fontWeight: 600, minWidth: 0 }}
      >
        {content.path}
      </Typography>
      <Chip size="small" label={`v${content.version}`} variant="outlined" />
      <Box sx={{ flex: 1 }} />
      <Tooltip title={`Updated ${formatDateTime(content.updatedAt)}`}>
        <Typography variant="captionMuted">
          {formatBytes(content.fileSize)} · {formatRelativeTime(content.updatedAt)}
        </Typography>
      </Tooltip>
      <ActionMenu items={actions} tooltip="File actions" />
    </Stack>
  );
}
