import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";

const SITE_URL = "https://depvault.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  // Cached so the route prerenders; `lastModified` refreshes once a day instead of per request.
  cacheLife("days");
  const lastModified = new Date();

  return [
    { url: SITE_URL, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/login`, lastModified, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/register`, lastModified, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/forgot-password`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
