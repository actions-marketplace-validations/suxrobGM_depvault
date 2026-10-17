"use client";

import { useEffect, useState } from "react";
import { useVault } from "@/hooks/use-vault";
import { describeKeyError } from "@/lib/crypto/errors";
import { type DecodedText, decodeText, decryptFileBytes, type EncryptedBlob } from "./file-crypto";

interface EncryptedFileBlob extends EncryptedBlob {
  isBinary: boolean;
}

interface DecryptedTextState {
  decoded: DecodedText | null;
  error: string | null;
}

/** Result tagged with the ciphertext it came from, so a stale result is never shown. */
interface TaggedDecryptedText extends DecryptedTextState {
  source?: string;
}

/**
 * Decrypts a fetched text blob (binary blobs are skipped). A cancellation flag stops a stale
 * decrypt from overwriting newer state; `decoded` is null while decrypting.
 */
export function useDecryptedText(
  projectId: string,
  blob: EncryptedFileBlob | undefined,
): DecryptedTextState {
  const { getProjectDEK } = useVault();
  const [state, setState] = useState<TaggedDecryptedText>({
    decoded: null,
    error: null,
  });

  const source = blob && !blob.isBinary ? blob.encryptedContent : undefined;

  useEffect(() => {
    if (!blob || blob.isBinary) return;

    let cancelled = false;
    getProjectDEK(projectId)
      .then((dek) => decryptFileBytes(blob, dek))
      .then((buffer) => {
        if (!cancelled) setState({ decoded: decodeText(buffer), error: null, source });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ decoded: null, error: describeKeyError(err), source });
      });

    return () => {
      cancelled = true;
    };
    // Keyed on the ciphertext, not the blob object, so a refetch of the same file does not re-decrypt.
  }, [projectId, source]);

  // Results for an older blob are hidden until the new one is decrypted.
  return state.source === source ? state : { decoded: null, error: null };
}
