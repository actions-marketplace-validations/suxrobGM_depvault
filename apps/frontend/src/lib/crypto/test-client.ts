import { vi } from "vitest";

/** Eden response helpers for the fake client. */
export const ok = <T>(data: T) => Promise.resolve({ data, error: null });
export const fail = (status: number, message = "error") =>
  Promise.resolve({ data: null, error: { status, value: { message } } });

/** Spies behind the fake Eden client; tests set return values with `mockReturnValue(ok(...))`. */
export const api = {
  status: vi.fn(),
  setup: vi.fn(),
  listGrants: vi.fn(),
  changePassword: vi.fn(),
  recover: vi.fn(),
  regenerateRecoveryKey: vi.fn(),
  getMyGrant: vi.fn(),
  storeMyGrants: vi.fn(),
  shareGrant: vi.fn(),
};

/** Stand-in for `@/api/client`: `vi.mock("@/api/client", () => import("./test-client"))`. */
export const client = {
  api: {
    vault: {
      status: { get: () => api.status() },
      setup: { post: (body: unknown) => api.setup(body) },
      keygrants: { get: (opts: unknown) => api.listGrants(opts) },
      password: { put: (body: unknown) => api.changePassword(body) },
      recover: { post: (body: unknown) => api.recover(body) },
      recoverykey: { put: (body: unknown) => api.regenerateRecoveryKey(body) },
    },
    projects: (params: unknown) => ({
      keygrants: {
        my: {
          get: () => api.getMyGrant(params),
          put: (body: unknown) => api.storeMyGrants(params, body),
        },
        post: (body: unknown) => api.shareGrant(params, body),
      },
    }),
  },
};
