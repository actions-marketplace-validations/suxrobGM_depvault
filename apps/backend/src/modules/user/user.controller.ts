import { Elysia } from "elysia";
import { container } from "@/common/di/container";
import { authGuard } from "@/common/middleware";
import { MessageResponseSchema } from "@/types/response";
import {
  AvatarUploadBodySchema,
  AvatarUploadResponseSchema,
  ChangeEmailBodySchema,
  ChangePasswordBodySchema,
  UpdateProfileBodySchema,
  UserProfileResponseSchema,
} from "./user.schema";
import { UserService } from "./user.service";

const userService = container.resolve(UserService);

export const userController = new Elysia({
  prefix: "/users",
  detail: { tags: ["Users"], security: [{ bearerAuth: [] }] },
})
  .use(authGuard)
  .get("/me", ({ user }) => userService.getProfile(user.id), {
    response: UserProfileResponseSchema,
    detail: {
      operationId: "getProfile",
      summary: "Get current user profile",
      description:
        "Return the authenticated user's profile including email, username, avatar, and linked accounts.",
    },
  })
  .patch("/me", ({ user, body }) => userService.updateProfile(user.id, body), {
    body: UpdateProfileBodySchema,
    response: UserProfileResponseSchema,
    detail: {
      operationId: "updateProfile",
      summary: "Update profile",
      description:
        "Update the authenticated user's username and/or avatar URL. Username must be unique.",
    },
  })
  .patch(
    "/me/password",
    ({ user, body, cookie }) =>
      userService.changePassword(user.id, body, String(cookie.refresh_token?.value ?? "")),
    {
      body: ChangePasswordBodySchema,
      response: MessageResponseSchema,
      detail: {
        operationId: "changePassword",
        summary: "Change password",
        description:
          "Change the authenticated user's password. Requires the current password when one is set. Signs out every other session.",
      },
    },
  )
  .patch("/me/email", ({ user, body }) => userService.changeEmail(user.id, body), {
    body: ChangeEmailBodySchema,
    response: MessageResponseSchema,
    detail: {
      operationId: "changeEmail",
      summary: "Change email address",
      description:
        "Change the authenticated user's email. Requires password verification. A new verification email is sent to the updated address.",
    },
  })
  .post("/me/avatar", ({ user, body }) => userService.uploadAvatar(user.id, body.file), {
    body: AvatarUploadBodySchema,
    response: AvatarUploadResponseSchema,
    detail: {
      operationId: "uploadAvatar",
      summary: "Upload avatar",
      description:
        "Upload and set the authenticated user's avatar image. Accepts jpg, png, gif, or webp up to 5 MB.",
    },
  })
  .delete("/me", ({ user }) => userService.deleteAccount(user.id), {
    response: MessageResponseSchema,
    detail: {
      operationId: "deleteAccount",
      summary: "Delete account",
      description:
        "Permanently delete the authenticated user's account and all associated data including projects, analyses, uploads, and secret files. This action is irreversible.",
    },
  });
