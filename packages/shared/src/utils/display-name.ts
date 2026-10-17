interface NamedUser {
  firstName: string | null | undefined;
  lastName: string | null | undefined;
}

/** "First Last" with empty parts dropped, or `fallback` when the user has no name. */
export function displayName(user: NamedUser, fallback = ""): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || fallback;
}
