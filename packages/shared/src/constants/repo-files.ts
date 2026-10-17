/** Largest plaintext file the server accepts. */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const MAX_PATH_LENGTH = 1024;

/** Most changes (and download ids) one `/files` batch request may carry. */
export const MAX_CHANGES_PER_REQUEST = 200;

/** Changes to files with these extensions are rejected. */
export const EXECUTABLE_EXTENSIONS = [".exe", ".sh", ".bat", ".cmd", ".ps1"];
