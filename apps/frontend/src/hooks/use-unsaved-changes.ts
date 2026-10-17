"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useConfirm } from "@/hooks/use-confirm";
import type { ConfirmFn } from "@/providers/confirm-provider";

/** Every mounted editor with a draft registers here, so unrelated UI can ask before discarding. */
const dirtySources = new Set<symbol>();

function askToDiscard(confirm: ConfirmFn): Promise<boolean> {
  return confirm({
    title: "Discard unsaved changes?",
    description: "You have unsaved changes to a file. They will be lost if you continue.",
    confirmLabel: "Discard changes",
    cancelLabel: "Keep editing",
    destructive: true,
  });
}

/** Returns a function resolving to true when there is no draft or the user agrees to drop it. */
export function useConfirmDiscard(): () => Promise<boolean> {
  const confirm = useConfirm();
  return async () => dirtySources.size === 0 || askToDiscard(confirm);
}

/**
 * While `dirty`, warns before the tab closes and intercepts in-app link clicks (sidebar, tabs,
 * breadcrumbs) with a confirm dialog. The App Router has no navigation-blocking API, so links are
 * caught in the capture phase before Next's own handler sees them.
 */
export function useUnsavedChangesGuard(dirty: boolean): void {
  const confirm = useConfirm();
  const router = useRouter();

  useEffect(() => {
    if (!dirty) return;

    const token = Symbol("unsaved-draft");
    dirtySources.add(token);

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.download) {
        return;
      }
      const url = new URL(anchor.href, window.location.href);
      const samePage =
        url.pathname === window.location.pathname && url.search === window.location.search;
      if (url.origin !== window.location.origin || samePage) return;

      event.preventDefault();
      event.stopPropagation();
      void askToDiscard(confirm).then((ok) => {
        if (!ok) return;
        dirtySources.delete(token);
        router.push(`${url.pathname}${url.search}${url.hash}` as Route);
      });
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      dirtySources.delete(token);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, confirm, router]);
}
