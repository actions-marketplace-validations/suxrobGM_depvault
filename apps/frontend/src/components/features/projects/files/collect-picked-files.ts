/** Turns drag-and-drop payloads and file inputs into repo-relative paths plus File handles. */

export interface PickedFile {
  /** Path relative to the drop/pick root, with forward slashes. */
  path: string;
  file: File;
}

/** Never useful in a config/secret store and huge in practice. */
const SKIPPED_FOLDERS = new Set([".git", "node_modules"]);
const SKIPPED_FILES = new Set([".DS_Store", "Thumbs.db"]);

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

function readFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function walk(entry: FileSystemEntry, out: PickedFile[]): Promise<void> {
  if (entry.isFile) {
    if (SKIPPED_FILES.has(entry.name)) return;
    const file = await readFile(entry as FileSystemFileEntry);
    out.push({ path: entry.fullPath.replace(/^\/+/, ""), file });
    return;
  }
  if (!entry.isDirectory || SKIPPED_FOLDERS.has(entry.name)) return;

  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // readEntries returns results in batches; an empty batch means the folder is exhausted.
  for (let batch = await readEntries(reader); batch.length > 0; batch = await readEntries(reader)) {
    for (const child of batch) await walk(child, out);
  }
}

/**
 * Collects files and whole folders from a drop. The entries must be taken synchronously inside
 * the drop handler (the DataTransfer is emptied afterwards), so call this before any `await`.
 */
export function collectDroppedFiles(dataTransfer: DataTransfer): Promise<PickedFile[]> {
  const entries = [...dataTransfer.items]
    .filter((item) => item.kind === "file")
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null);

  return (async () => {
    const out: PickedFile[] = [];
    for (const entry of entries) await walk(entry, out);
    return out;
  })();
}

/** Files from an `<input type="file">`; folder pickers fill `webkitRelativePath`. */
export function collectInputFiles(list: FileList): PickedFile[] {
  return [...list]
    .filter((file) => !SKIPPED_FILES.has(file.name))
    .map((file) => ({ path: file.webkitRelativePath || file.name, file }));
}
