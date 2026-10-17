"use client";

import { type ReactElement, type RefObject, useState } from "react";
import {
  NoteAdd as NewFileIcon,
  UploadFile as UploadIcon,
  FolderZip as ZipIcon,
} from "@mui/icons-material";
import { Button, Stack, Tooltip } from "@mui/material";
import { SearchField } from "@/components/ui/inputs";
import { collectInputFiles, type PickedFile } from "./collect-picked-files";

interface FilesToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  canEdit: boolean;
  /** The hidden file input, so the empty state can open the picker too. */
  inputRef: RefObject<HTMLInputElement | null>;
  onPicked: (files: PickedFile[]) => void;
  onNewFile: () => void;
  /** Disabled when there is nothing to download. */
  canDownload: boolean;
  onDownloadAll: () => Promise<void>;
}

/** Search, add/new file and "download all" controls above the file tree. */
export function FilesToolbar(props: FilesToolbarProps): ReactElement {
  const { search, onSearchChange, canEdit, inputRef, onPicked, onNewFile } = props;
  const { canDownload, onDownloadAll } = props;
  const [zipping, setZipping] = useState(false);

  const handleDownloadAll = async () => {
    setZipping(true);
    try {
      await onDownloadAll();
    } finally {
      setZipping(false);
    }
  };

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
      <SearchField
        placeholder="Search by path"
        value={search}
        onChange={onSearchChange}
        sx={{ flex: 1, minWidth: 220 }}
      />
      {canEdit && (
        <>
          <Button
            variant="contained"
            startIcon={<UploadIcon />}
            onClick={() => inputRef.current?.click()}
          >
            Add files
          </Button>
          <Button variant="outlined" startIcon={<NewFileIcon />} onClick={onNewFile}>
            New file
          </Button>
        </>
      )}
      <Tooltip title="Download every file, decrypted in your browser, as a zip">
        <span>
          <Button
            variant="outlined"
            startIcon={<ZipIcon />}
            disabled={!canDownload || zipping}
            onClick={handleDownloadAll}
          >
            {zipping ? "Preparing..." : "Download all"}
          </Button>
        </span>
      </Tooltip>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onPicked(collectInputFiles(e.target.files));
          e.target.value = "";
        }}
      />
    </Stack>
  );
}
