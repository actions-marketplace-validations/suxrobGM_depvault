"use client";

import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Button, type ButtonProps, DialogActions, type SxProps, type Theme } from "@mui/material";
import { useFormContext } from "./form-context";

interface FormProps extends Omit<ComponentProps<"form">, "onSubmit"> {
  children: ReactNode;
}

interface SubmitButtonProps extends Omit<ButtonProps, "type"> {
  /** Label while the form is submitting; defaults to `children`. */
  pendingLabel?: ReactNode;
}

interface DialogFormActionsProps {
  onCancel: () => void;
  submitLabel: ReactNode;
  pendingLabel?: ReactNode;
  cancelLabel?: string;
  submitColor?: ButtonProps["color"];
  /** Disables submit on top of the built-in "while submitting" state. */
  disabled?: boolean;
  sx?: SxProps<Theme>;
}

/** `<form>` bound to the surrounding `useAppForm`: submit runs validation + `onSubmit`, no reload. */
export function Form(props: FormProps): ReactElement {
  const { children, ...rest } = props;
  const form = useFormContext();

  return (
    <form
      {...rest}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      {children}
    </form>
  );
}

/** Submit button that disables itself and swaps its label while the form is submitting. */
export function SubmitButton(props: SubmitButtonProps): ReactElement {
  const { children, pendingLabel, disabled, variant = "contained", ...rest } = props;
  const form = useFormContext();

  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button type="submit" variant={variant} disabled={disabled || isSubmitting} {...rest}>
          {isSubmitting ? (pendingLabel ?? children) : children}
        </Button>
      )}
    </form.Subscribe>
  );
}

/** Cancel + submit row for a dialog form; both lock while the form is submitting. */
export function DialogFormActions(props: DialogFormActionsProps): ReactElement {
  const {
    onCancel,
    submitLabel,
    pendingLabel,
    cancelLabel = "Cancel",
    submitColor,
    disabled,
    sx = { px: 3, pb: 2 },
  } = props;
  const form = useFormContext();

  return (
    <DialogActions sx={sx}>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button onClick={onCancel} disabled={isSubmitting}>
            {cancelLabel}
          </Button>
        )}
      </form.Subscribe>
      <SubmitButton color={submitColor} disabled={disabled} pendingLabel={pendingLabel}>
        {submitLabel}
      </SubmitButton>
    </DialogActions>
  );
}
