/**
 * Non-color tokens (geometry, depth, blur, glow) for the glass shell; color lives in the palette.
 * Overrides read `theme.app.*` instead of hardcoding values so the shell is retuned in one place.
 */
export interface AppStyleTokens {
  /** Base shape radius (cards, surfaces, inputs). */
  radius: number;
  surface: {
    /** Page background (`background.default`). */
    base: string;
    /** Card / panel background (`background.paper`). */
    raised: string;
    /** Highest tier: menus, popovers, tooltips. */
    elevated: string;
  };
  /** Backdrop blur in px for glass surfaces; 0 disables glassmorphism. */
  blur: number;
  /** Alpha for glassy surfaces (1 = fully opaque). */
  surfaceAlpha: number;
  shadow: {
    card: string;
    elevated: string;
  };
  /** Hover glow for accented surfaces; builders splice the accent color channel in. */
  glow: {
    hover: (channel: string) => string;
  };
}

/**
 * DepVault's locked visual direction: translucent glass surfaces over a deep navy
 * base, soft emerald glow on interaction, generous 10px radius.
 */
export const appStyleTokens: AppStyleTokens = {
  radius: 10,
  surface: { base: "#0a0e17", raised: "#0f1420", elevated: "#161c2e" },
  blur: 12,
  surfaceAlpha: 0.6,
  shadow: {
    card: "none",
    elevated: "0 8px 32px rgba(0, 0, 0, 0.3)",
  },
  glow: {
    hover: (channel) => `0 0 24px rgba(${channel} / 0.15)`,
  },
};
