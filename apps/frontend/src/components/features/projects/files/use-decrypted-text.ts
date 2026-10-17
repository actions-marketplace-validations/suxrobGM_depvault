"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/api/query-keys";
import { useVault } from "@/hooks/use-vault";
import { describeKeyError } from "@/lib/crypto/errors";
import { type DecodedText, decodeText, decryptFileBytes, type EncryptedBlob } from "./file-crypto";

interface EncryptedFileBlob extends EncryptedBlob {
  id: string;
  version: number;
  isBinary: boolean;
}

interface DecryptedTextState {
  decoded: DecodedText | null;
  error: string | null;
}

/**
 * Decrypts a fetched text blob (binary blobs are skipped); `decoded` is null while decrypting.
 * Keyed on the file version, so a refetch of the same version doesn't re-decrypt and an older
 * version's result is never shown for a newer one. The plaintext is dropped from the query
 * cache as soon as nothing renders it.
 */
export function useDecryptedText(
  projectId: string,
  blob: EncryptedFileBlob | null,
): DecryptedTextState {
  const { getProjectDEK } = useVault();
  const textBlob = blob && !blob.isBinary ? blob : null;

  const query = useQuery({
    queryKey: queryKeys.files.decryptedText(projectId, textBlob?.id ?? "", textBlob?.version ?? 0),
    queryFn: async () => {
      if (!textBlob) return null;
      return decodeText(await decryptFileBytes(textBlob, await getProjectDEK(projectId)));
    },
    enabled: textBlob !== null,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    retry: false,
  });

  return {
    decoded: query.data ?? null,
    error: query.error ? describeKeyError(query.error) : null,
  };
}
