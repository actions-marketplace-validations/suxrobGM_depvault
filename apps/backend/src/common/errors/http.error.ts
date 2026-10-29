/** Machine-readable error causes clients branch on instead of matching message text. */
export type ErrorReason = "PLAN_LIMIT";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly reason: ErrorReason | null = null,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class BadRequestError extends HttpError {
  constructor(message = "Bad request") {
    super(400, message);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Unauthorized") {
    super(401, message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "Forbidden", reason: ErrorReason | null = null) {
    super(403, message, reason);
  }
}

/** A 403 for a plan limit or a feature the plan lacks; clients offer an upgrade. */
export class PlanLimitError extends ForbiddenError {
  constructor(message: string) {
    super(message, "PLAN_LIMIT");
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Not found") {
    super(404, message);
  }
}

export class ConflictError extends HttpError {
  constructor(message = "Conflict") {
    super(409, message);
  }
}

export class GoneError extends HttpError {
  constructor(message = "Gone") {
    super(410, message);
  }
}

export class TooManyRequestsError extends HttpError {
  constructor(message = "Too many requests, please try again later") {
    super(429, message);
  }
}
