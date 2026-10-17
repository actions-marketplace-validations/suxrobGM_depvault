import type { Body } from "@depvault/shared/api";
import type { client } from "@/api/client";

type Admin = typeof client.api.admin;
type AdminUserById = ReturnType<Admin["users"]>;

export type CompSubscriptionBody = Body<AdminUserById["subscription"]["patch"]>;
