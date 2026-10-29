/** Builds a GitHub-style folder tree from flat repo-relative paths. */

interface PathItem {
  path: string;
}

export interface FileTreeFolder<T extends PathItem> {
  name: string;
  /** Folder path without a trailing slash; "" for the root. */
  path: string;
  folders: FileTreeFolder<T>[];
  files: T[];
  /** Number of files in this folder and all subfolders. */
  fileCount: number;
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

/** Groups files by folder; folders sort before files, both alphabetically. */
export function buildFileTree<T extends PathItem>(files: T[]): FileTreeFolder<T> {
  const root: FileTreeFolder<T> = { name: "", path: "", folders: [], files: [], fileCount: 0 };

  for (const file of files) {
    const segments = file.path.split("/");
    segments.pop();
    let folder = root;
    folder.fileCount++;
    for (const segment of segments) {
      const path = folder.path ? `${folder.path}/${segment}` : segment;
      let child = folder.folders.find((f) => f.name === segment);
      if (!child) {
        child = { name: segment, path, folders: [], files: [], fileCount: 0 };
        folder.folders.push(child);
      }
      child.fileCount++;
      folder = child;
    }
    folder.files.push(file);
  }

  sortFolder(root);
  return root;
}

function sortFolder<T extends PathItem>(folder: FileTreeFolder<T>): void {
  folder.folders.sort((a, b) => byName(a.name, b.name));
  folder.files.sort((a, b) => byName(a.path, b.path));
  for (const child of folder.folders) sortFolder(child);
}

/** Case-insensitive substring match on the full path; every space-separated term must match. */
export function filterByPath<T extends PathItem>(files: T[], query: string): T[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return files;
  return files.filter((file) => {
    const path = file.path.toLowerCase();
    return terms.every((term) => path.includes(term));
  });
}
