import type { ReactElement } from "react";
import { Skeleton, Stack } from "@mui/material";

interface AuthFormSkeletonProps {
  fields?: number;
}

/** Suspense fallback for auth forms that read the URL, so the card shell can prerender. */
export function AuthFormSkeleton(props: AuthFormSkeletonProps): ReactElement {
  const { fields = 2 } = props;

  return (
    <Stack spacing={2.5}>
      {Array.from({ length: fields }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders, never reordered
        <Skeleton key={i} variant="rounded" height={56} />
      ))}
      <Skeleton variant="rounded" height={42} />
    </Stack>
  );
}
