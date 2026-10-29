"use client";

import {
  createContext,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
  useRef,
  useState,
} from "react";
import { ConfirmDialog } from "@/components/ui/feedback";

interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  confirmationText?: string;
  confirmationHint?: ReactNode;
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

export const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Provides an awaitable `confirm` function that shows a confirmation dialog. */
export function ConfirmProvider(props: PropsWithChildren): ReactElement {
  const { children } = props;
  const [state, setState] = useState<(ConfirmOptions & { open: boolean }) | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm: ConfirmFn = (options) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({ ...options, open: true });
    });
  };

  const handleConfirm = () => {
    resolveRef.current?.(true);
    resolveRef.current = null;
    setState(null);
  };

  const handleCancel = () => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setState(null);
  };

  return (
    <ConfirmContext value={confirm}>
      {children}
      {state && (
        <ConfirmDialog
          open={state.open}
          title={state.title}
          description={state.description}
          confirmLabel={state.confirmLabel}
          cancelLabel={state.cancelLabel}
          destructive={state.destructive}
          confirmationText={state.confirmationText}
          confirmationHint={state.confirmationHint}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </ConfirmContext>
  );
}
