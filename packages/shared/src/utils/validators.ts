const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

export const PASSWORD_REQUIREMENTS =
  "Password must be at least 8 characters with one uppercase letter and one number";

export function isValidPassword(password: string): boolean {
  return PASSWORD_REGEX.test(password);
}
