"use client";

import { type DragEvent, type ReactElement, useState } from "react";
import { Box, Typography } from "@mui/material";
import { collectDroppedFiles, type PickedFile } from "./collect-picked-files";

interface DropTargetProps {
  onDragOver?: (event: DragEvent) => void;
  onDragLeave?: (event: DragEvent) => void;
  onDrop?: (event: DragEvent) => void;
}

interface FileDrop {
  /** Spread onto the drop target; empty when dropping is disabled. */
  dropProps: DropTargetProps;
  /** Overlay to render inside the (relatively positioned) drop target while dragging. */
  overlay: ReactElement | null;
}

/** Drag-and-drop of files and whole folders onto a container. */
export function useFileDrop(enabled: boolean, onFiles: (files: PickedFile[]) => void): FileDrop {
  const [dragging, setDragging] = useState(false);

  const dropProps: DropTargetProps = enabled
    ? {
        onDragOver: (event) => {
          event.preventDefault();
          if (!dragging) setDragging(true);
        },
        onDragLeave: (event) => {
          // Leaving into a child still counts as inside the target.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        },
        onDrop: async (event) => {
          event.preventDefault();
          setDragging(false);
          const dropped = await collectDroppedFiles(event.dataTransfer);
          if (dropped.length > 0) onFiles(dropped);
        },
      }
    : {};

  const overlay = dragging ? (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        zIndex: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: 2,
        borderStyle: "dashed",
        borderColor: "primary.main",
        borderRadius: 2,
        bgcolor: "background.paper",
        opacity: 0.92,
        pointerEvents: "none",
      }}
    >
      <Typography variant="h6">Drop files or folders to add them</Typography>
    </Box>
  ) : null;

  return { dropProps, overlay };
}
