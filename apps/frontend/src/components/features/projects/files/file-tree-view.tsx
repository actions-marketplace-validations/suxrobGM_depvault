"use client";

import { type ReactElement, useState } from "react";
import {
  InsertDriveFile as BinaryIcon,
  ExpandLess,
  ExpandMore,
  Description as FileIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
} from "@mui/icons-material";
import { List, ListItemButton, ListItemIcon, ListItemText, Typography } from "@mui/material";
import type { RepoFileDto } from "@/api/types/repo-file";
import { formatBytes } from "@/utils/formatters";
import { basename } from "./file-format";
import { buildFileTree, type FileTreeFolder } from "./file-tree";

interface FileTreeViewProps {
  files: RepoFileDto[];
  selectedFileId: string | null;
  onSelectFile: (fileId: string) => void;
  /** Force every folder open (e.g. while a search is active). */
  expandAll?: boolean;
}

const indent = (depth: number) => 1.5 + depth * 2;

/** Collapsible folder tree derived from file paths. Folders start expanded. */
export function FileTreeView(props: FileTreeViewProps): ReactElement {
  const { files, selectedFileId, onSelectFile, expandAll = false } = props;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const toggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  if (files.length === 0) {
    return (
      <Typography variant="body2Muted" sx={{ px: 2, py: 3, display: "block" }}>
        No files match your search.
      </Typography>
    );
  }

  const renderFolder = (folder: FileTreeFolder<RepoFileDto>, depth: number): ReactElement[] => [
    ...folder.folders.flatMap((child) => {
      const isOpen = expandAll || !collapsed.has(child.path);
      return [
        <ListItemButton
          key={`folder:${child.path}`}
          onClick={() => toggle(child.path)}
          sx={{ pl: indent(depth), pr: 1 }}
        >
          <ListItemIcon sx={{ minWidth: 30 }}>
            {isOpen ? <FolderOpenIcon fontSize="small" /> : <FolderIcon fontSize="small" />}
          </ListItemIcon>
          <ListItemText
            primary={child.name}
            slotProps={{ primary: { noWrap: true, sx: { fontWeight: 500, fontSize: "0.85rem" } } }}
          />
          <Typography variant="captionMuted" sx={{ mx: 0.5 }}>
            {child.fileCount}
          </Typography>
          {isOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
        </ListItemButton>,
        ...(isOpen ? renderFolder(child, depth + 1) : []),
      ];
    }),
    ...folder.files.map((file) => (
      <ListItemButton
        key={file.id}
        selected={file.id === selectedFileId}
        onClick={() => onSelectFile(file.id)}
        sx={{ pl: indent(depth), pr: 1.5 }}
      >
        <ListItemIcon sx={{ minWidth: 30 }}>
          {file.isBinary ? <BinaryIcon fontSize="small" /> : <FileIcon fontSize="small" />}
        </ListItemIcon>
        <ListItemText
          primary={basename(file.path)}
          slotProps={{
            primary: {
              noWrap: true,
              title: file.path,
              sx: { fontFamily: "monospace", fontSize: "0.8rem" },
            },
          }}
        />
        <Typography variant="captionMuted" sx={{ ml: 1, flexShrink: 0 }}>
          {formatBytes(file.fileSize)}
        </Typography>
      </ListItemButton>
    )),
  ];

  return (
    <List dense disablePadding sx={{ pb: 1 }}>
      {renderFolder(buildFileTree(files), 0)}
    </List>
  );
}
