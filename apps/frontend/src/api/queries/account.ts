"use client";

import { client } from "@/api/client";
import { useApiMutation } from "@/api/hooks";

interface ProfileValues {
  firstName: string;
  lastName: string;
}

interface ChangeEmailValues {
  newEmail: string;
  password: string;
}

interface ChangePasswordValues {
  /** Omitted when an OAuth-only account sets its first password. */
  currentPassword?: string;
  newPassword: string;
}

interface AccountMutationOptions<TData = unknown> {
  successMessage?: string;
  onSuccess?: (data: TData) => void;
}

/** Updates the current user's name; the caller mirrors it into the auth context. */
export function useUpdateProfile(options: AccountMutationOptions<ProfileValues> = {}) {
  return useApiMutation((values: ProfileValues) => client.api.users.me.patch(values), {
    successMessage: "Profile updated",
    onSuccess: (data) => options.onSuccess?.(data),
  });
}

/** Changes the login email; the new address must be verified. */
export function useChangeEmail(options: AccountMutationOptions = {}) {
  return useApiMutation((values: ChangeEmailValues) => client.api.users.me.email.patch(values), {
    successMessage: "Email updated. Please verify your new email address.",
    onSuccess: (data) => options.onSuccess?.(data),
  });
}

/** Changes the password, or sets the first one for an OAuth-only account. */
export function useChangePassword(options: AccountMutationOptions = {}) {
  return useApiMutation(
    (values: ChangePasswordValues) => client.api.users.me.password.patch(values),
    {
      successMessage: options.successMessage ?? "Password changed successfully",
      onSuccess: (data) => options.onSuccess?.(data),
    },
  );
}

/** Permanently deletes the account and everything it owns. */
export function useDeleteAccount(options: AccountMutationOptions = {}) {
  return useApiMutation(() => client.api.users.me.delete(), {
    successMessage: "Account deleted",
    onSuccess: (data) => options.onSuccess?.(data),
  });
}
