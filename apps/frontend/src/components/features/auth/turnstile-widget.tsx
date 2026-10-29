"use client";

import { type ReactElement, useEffect, useRef } from "react";
import { Box } from "@mui/material";
import { TURNSTILE_SITE_KEY } from "@/lib/constants";

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileRenderOptions {
  sitekey: string;
  theme: "auto" | "light" | "dark";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
}

interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

const loadTurnstile = (): Promise<TurnstileApi> => {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject());
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Failed to load Turnstile"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
};

interface TurnstileWidgetProps {
  /** Receives a fresh token, or null once it expires or the challenge errors. */
  onTokenChange: (token: string | null) => void;
}

/**
 * Cloudflare Turnstile challenge. Tokens are single-use, so remount it (change its `key`) after a
 * failed submit. Renders nothing when no site key is configured.
 */
export function TurnstileWidget(props: TurnstileWidgetProps): ReactElement | null {
  const { onTokenChange } = props;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!TURNSTILE_SITE_KEY || !container) {
      return;
    }

    let widgetId: string | null = null;
    let cancelled = false;

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled) {
          return;
        }
        widgetId = turnstile.render(container, {
          sitekey: TURNSTILE_SITE_KEY as string,
          theme: "auto",
          callback: (token) => onTokenChange(token),
          "expired-callback": () => onTokenChange(null),
          "error-callback": () => onTokenChange(null),
        });
      })
      .catch(() => onTokenChange(null));

    return () => {
      cancelled = true;
      if (widgetId) {
        window.turnstile?.remove(widgetId);
      }
    };
  }, [onTokenChange]);

  if (!TURNSTILE_SITE_KEY) {
    return null;
  }

  return (
    <Box ref={containerRef} sx={{ display: "flex", justifyContent: "center", minHeight: 65 }} />
  );
}

/** Whether a submit may proceed: always without a site key, else only with a token. */
export function isCaptchaReady(token: string | null): boolean {
  return !TURNSTILE_SITE_KEY || token !== null;
}
