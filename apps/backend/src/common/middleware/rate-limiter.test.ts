import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { UnauthorizedError } from "@/common/errors/http.error";
import { errorMiddleware } from "./error.middleware";
import { RateLimitStore, rateLimiter } from "./rate-limiter";

describe("RateLimitStore", () => {
  let store: RateLimitStore;

  beforeEach(() => {
    store = new RateLimitStore(600_000);
  });

  afterEach(() => {
    store.destroy();
  });

  describe("hit", () => {
    it("should start count at 1 for a new key", () => {
      const result = store.hit("key1", 60_000);
      expect(result.count).toBe(1);
      expect(result.resetAt).toBeGreaterThan(Date.now() - 1);
    });

    it("should increment count for existing key within window", () => {
      store.hit("key1", 60_000);
      store.hit("key1", 60_000);
      const result = store.hit("key1", 60_000);
      expect(result.count).toBe(3);
    });

    it("should track different keys independently", () => {
      store.hit("key1", 60_000);
      store.hit("key1", 60_000);
      const result = store.hit("key2", 60_000);
      expect(result.count).toBe(1);
    });

    it("should reset count after window expires", async () => {
      store.hit("key1", 50);
      store.hit("key1", 50);
      await Bun.sleep(60);
      const result = store.hit("key1", 50);
      expect(result.count).toBe(1);
    });
  });

  describe("get", () => {
    it("should return null for unknown key", () => {
      expect(store.get("nonexistent")).toBeNull();
    });

    it("should return entry for active key", () => {
      store.hit("key1", 60_000);
      const entry = store.get("key1");
      expect(entry).toBeDefined();
      expect(entry!.count).toBe(1);
    });

    it("should return null for expired key", async () => {
      store.hit("key1", 50);
      await Bun.sleep(60);
      expect(store.get("key1")).toBeNull();
    });
  });

  describe("reset", () => {
    it("should remove a key from the store", () => {
      store.hit("key1", 60_000);
      store.reset("key1");
      expect(store.get("key1")).toBeNull();
    });
  });

  describe("size", () => {
    it("should return the number of entries", () => {
      store.hit("key1", 60_000);
      store.hit("key2", 60_000);
      expect(store.size).toBe(2);
    });
  });
});

describe("rateLimit macro", () => {
  let store: RateLimitStore;

  beforeEach(() => {
    store = new RateLimitStore(600_000);
  });

  afterEach(() => {
    store.destroy();
  });

  const createApp = (max: number, windowMs: number) =>
    new Elysia()
      .use(errorMiddleware)
      .use(rateLimiter)
      .get("/test", () => ({ ok: true }), { rateLimit: { max, windowMs, store } })
      .get("/open", () => ({ ok: true }));

  const hit = (app: { handle(req: Request): Promise<Response> }, path: string, ip = "1.1.1.1") =>
    app.handle(new Request(`http://localhost${path}`, { headers: { "x-forwarded-for": ip } }));

  it("should allow requests within the limit", async () => {
    const res = await hit(createApp(3, 60_000), "/test");

    expect(res.status).toBe(200);
    expect(res.headers.get("x-ratelimit-limit")).toBe("3");
    expect(res.headers.get("x-ratelimit-remaining")).toBe("2");
  });

  it("should return 429 with retry-after when the limit is exceeded", async () => {
    const app = createApp(2, 60_000);

    await hit(app, "/test");
    await hit(app, "/test");
    const res = await hit(app, "/test");

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).not.toBeNull();
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("Too many requests");
  });

  it("should leave routes without the option unlimited", async () => {
    const res = await hit(createApp(1, 60_000), "/open");

    expect(res.status).toBe(200);
    expect(res.headers.get("x-ratelimit-limit")).toBeNull();
  });

  it("should allow requests again after the window expires", async () => {
    const app = createApp(1, 50);

    await hit(app, "/test");
    expect((await hit(app, "/test")).status).toBe(429);

    await Bun.sleep(60);
    expect((await hit(app, "/test")).status).toBe(200);
  });

  it("should track client IPs independently", async () => {
    const app = createApp(1, 60_000);

    await hit(app, "/test", "1.1.1.1");
    expect((await hit(app, "/test", "1.1.1.1")).status).toBe(429);
    expect((await hit(app, "/test", "2.2.2.2")).status).toBe(200);
  });

  it("should share one bucket across URLs of the same route template", async () => {
    const app = new Elysia()
      .use(errorMiddleware)
      .use(rateLimiter)
      .get("/shares/:token", () => ({ ok: true }), {
        rateLimit: { max: 1, windowMs: 60_000, store },
      });

    await hit(app, "/shares/aaa");
    expect((await hit(app, "/shares/bbb")).status).toBe(429);
  });

  it("should not let one route's traffic exhaust another route's limit", async () => {
    const rateLimit = { max: 1, windowMs: 60_000, store };
    const app = new Elysia()
      .use(errorMiddleware)
      .use(rateLimiter)
      .get("/poll", () => ({ ok: true }), { rateLimit })
      .get("/login", () => ({ ok: true }), { rateLimit });

    await hit(app, "/poll");
    expect((await hit(app, "/poll")).status).toBe(429);
    expect((await hit(app, "/login")).status).toBe(200);
  });

  it("should count requests a resolve-based guard rejects", async () => {
    const guard = new Elysia({ name: "test-guard" }).resolve({ as: "scoped" }, () => {
      throw new UnauthorizedError("Invalid token");
    });
    const app = new Elysia()
      .use(errorMiddleware)
      .use(rateLimiter)
      .use(guard)
      .get("/guarded", () => ({ ok: true }), { rateLimit: { max: 1, windowMs: 60_000, store } });

    expect((await hit(app, "/guarded")).status).toBe(401);
    expect((await hit(app, "/guarded")).status).toBe(429);
  });
});
