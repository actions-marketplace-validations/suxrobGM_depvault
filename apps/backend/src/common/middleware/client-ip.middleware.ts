import { Elysia } from "elysia";
import { getClientIp } from "@/common/utils/ip";

/** Derives `clientIp` once per request, for audit logs, allowlists and share-link access. */
export const withClientIp = new Elysia({ name: "client-ip" }).derive(
  { as: "global" },
  ({ request, server }) => ({ clientIp: getClientIp(request, server) }),
);
