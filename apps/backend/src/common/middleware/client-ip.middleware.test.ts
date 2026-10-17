import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { withClientIp } from "./client-ip.middleware";

describe("withClientIp", () => {
  // Mirrors the app: controllers get it directly or through a guard plugin, and the plugin is
  // deduplicated by name after its first use.
  const guard = new Elysia({ name: "test-guard" }).use(withClientIp);
  const direct = new Elysia({ prefix: "/direct" })
    .use(withClientIp)
    .get("/", ({ clientIp }) => clientIp);
  const viaGuard = new Elysia({ prefix: "/guarded" })
    .use(guard)
    .get("/", ({ clientIp }) => clientIp);
  const app = new Elysia().use(direct).use(viaGuard);

  it.each(["/direct", "/guarded"])("should derive the forwarded client IP on %s", async (path) => {
    const res = await app.handle(
      new Request(`http://localhost${path}`, {
        headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
      }),
    );

    expect(await res.text()).toBe("203.0.113.7");
  });
});
