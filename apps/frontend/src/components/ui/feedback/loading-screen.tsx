import type { ReactElement } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";

interface LoadingScreenProps {
  message?: string;
}

/** Full-page loading screen for long loads (initial app load, project switch). */
export function LoadingScreen(props: LoadingScreenProps): ReactElement {
  const { message } = props;

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "50vh",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
      }}
    >
      <CircularProgress />
      {message && <Typography variant="body2Muted">{message}</Typography>}
    </Box>
  );
}
