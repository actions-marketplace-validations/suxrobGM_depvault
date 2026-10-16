// Public surface of the auth module.
// NOTE: `./actions` is intentionally excluded — it is a "use server" module and
// is imported directly via "@/auth/actions".
export { AuthProvider } from "./auth-provider";
