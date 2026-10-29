"use client";

import { type ReactElement, useState } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
} from "@mui/material";
import { OneTimeSecret } from "@/components/ui/data-display";

interface RecoveryKeyDisplayProps {
  open: boolean;
  title: string;
  warning: string;
  confirmLabel: string;
  recoveryKey: string;
  onDone: () => void;
}

/** Shared dialog for displaying a recovery key with copy and confirmation. */
export function RecoveryKeyDisplay(props: RecoveryKeyDisplayProps): ReactElement {
  const { open, title, warning, confirmLabel, recoveryKey, onDone } = props;

  const [savedConfirmed, setSavedConfirmed] = useState(false);

  const handleDone = () => {
    setSavedConfirmed(false);
    onDone();
  };

  return (
    <Dialog open={open} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5}>
          <OneTimeSecret
            value={recoveryKey}
            warning={warning}
            copyLabel="Copy Recovery Key"
            copiedMessage="Recovery key copied to clipboard"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={savedConfirmed}
                onChange={(_, checked) => setSavedConfirmed(checked)}
              />
            }
            label={confirmLabel}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleDone} variant="contained" disabled={!savedConfirmed}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
