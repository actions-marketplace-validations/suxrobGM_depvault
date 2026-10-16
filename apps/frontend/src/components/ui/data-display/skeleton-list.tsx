import type { ReactElement } from "react";
import { Box, Skeleton, Stack } from "@mui/material";

type SkeletonListVariant = "row" | "avatar";

interface SkeletonListProps {
  count?: number;
  /** Row height ("row" variant only). */
  height?: number;
  spacing?: number;
  /** "row": plain bars; "avatar": circle + text lines. */
  variant?: SkeletonListVariant;
  /** Avatar diameter ("avatar" variant only). */
  avatarSize?: number;
}

/** Renders a vertical stack of skeleton placeholders with fading opacity. */
export function SkeletonList(props: SkeletonListProps): ReactElement {
  const { count = 5, height = 64, spacing = 1.5, variant = "row", avatarSize = 32 } = props;

  return (
    <Stack spacing={spacing}>
      {Array.from({ length: count }, (_, i) => {
        const opacity = 1 - i * (0.6 / count);

        if (variant === "avatar") {
          return (
            <Stack
              // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders, never reordered
              key={i}
              direction="row"
              spacing={1.5}
              sx={{
                alignItems: "center",
                opacity,
              }}
            >
              <Skeleton variant="circular" width={avatarSize} height={avatarSize} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="text" width="55%" height={20} />
                <Skeleton variant="text" width="85%" height={16} />
                <Skeleton variant="text" width="30%" height={14} />
              </Box>
            </Stack>
          );
        }

        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders, never reordered
          <Skeleton key={i} variant="rounded" height={height} sx={{ borderRadius: 2, opacity }} />
        );
      })}
    </Stack>
  );
}
