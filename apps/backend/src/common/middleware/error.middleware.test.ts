import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { ForbiddenError, PlanLimitError } from "@/common/errors/http.error";
import { errorMiddleware } from "./error.middleware";

describe("errorMiddleware", () => {
  const app = new Elysia()
    .use(errorMiddleware)
    .get("/limit", () => {
      throw new PlanLimitError("Project limit reached (1/1). Upgrade your plan.");
    })
    .get("/forbidden", () => {
      throw new ForbiddenError("Nope");
    });

  it("should send a plan limit's reason in the body and the X-Error-Reason header", async () => {
    const res = await app.handle(new Request("http://localhost/limit"));

    expect(res.status).toBe(403);
    expect(res.headers.get("x-error-reason")).toBe("PLAN_LIMIT");
    expect(await res.json()).toEqual({
      code: 403,
      message: "Project limit reached (1/1). Upgrade your plan.",
      reason: "PLAN_LIMIT",
    });
  });

  it("should omit the reason for errors without one", async () => {
    const res = await app.handle(new Request("http://localhost/forbidden"));

    expect(res.headers.get("x-error-reason")).toBeNull();
    expect(await res.json()).toEqual({ code: 403, message: "Nope" });
  });
});
