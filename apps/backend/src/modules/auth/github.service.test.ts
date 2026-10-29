import { beforeEach, describe, expect, it } from "bun:test";
import { decodeOAuthState } from "@depvault/shared/utils";
import { env } from "@/env";
import type { PrismaClient } from "@/generated/prisma";
import type { InvitationService } from "@/modules/invitation/invitation.service";
import type { DeepMockProxy } from "@/types/deep-mock";
import { GitHubService } from "./github.service";
import type { TokenService } from "./token.service";

function createService(): GitHubService {
  return new GitHubService(
    {} as unknown as DeepMockProxy<PrismaClient>,
    {} as unknown as TokenService,
    {} as unknown as InvitationService,
  );
}

/** Reads the `state` param back out of the authorization URL, the way GitHub echoes it to us. */
function stateOf(authUrl: string): string | null {
  return new URL(authUrl).searchParams.get("state");
}

describe("GitHubService", () => {
  let service: GitHubService;

  beforeEach(() => {
    env.GITHUB_CLIENT_ID = "test-client-id";
    service = createService();
  });

  describe("getAuthUrl", () => {
    it("should carry the return path through state so the callback can honor it", () => {
      const url = service.getAuthUrl("/cli/verify?code=ABCD-EFGH");

      expect(decodeOAuthState(stateOf(url))).toBe("/cli/verify?code=ABCD-EFGH");
    });

    it("should still emit a state param when there is no return path", () => {
      const state = stateOf(service.getAuthUrl());

      expect(state).toBeTruthy();
      expect(decodeOAuthState(state)).toBeNull();
    });

    it("should drop an unsafe return path instead of carrying it", () => {
      const url = service.getAuthUrl("https://evil.example");

      expect(decodeOAuthState(stateOf(url))).toBeNull();
    });

    it("should target GitHub's authorize endpoint with the configured client id", () => {
      const url = new URL(service.getAuthUrl());

      expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
      expect(url.searchParams.get("client_id")).toBe("test-client-id");
    });
  });
});
