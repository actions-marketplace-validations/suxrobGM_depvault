"use server";

import { getServerClient } from "@/api/server";
import type { ActionResult } from "@/types/action";

export async function resetPasswordAction(token: string, password: string): Promise<ActionResult> {
  const client = await getServerClient();
  const { data, error } = await client.api.auth["password-resets"].put({ token, password });
  if (error) {
    return { success: false, error: error.value.message ?? "Failed to reset password" };
  }
  return { success: true, data };
}

export async function verifyEmailAction(token: string): Promise<ActionResult> {
  const client = await getServerClient();
  const { data, error } = await client.api.auth["email-verifications"].post({ token });
  if (error) {
    return { success: false, error: error.value.message ?? "Failed to verify email" };
  }
  return { success: true, data };
}
