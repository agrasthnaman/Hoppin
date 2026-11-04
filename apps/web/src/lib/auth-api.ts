import { validatePassword } from "@hoppin/core";

type ServerError = { code?: string; message: string; status?: number } | null;

/** The slice of the Supabase auth client used here, so it can be faked in tests. */
export interface PasswordClient {
  auth: {
    signUp(args: {
      email: string;
      password: string;
      options: { emailRedirectTo: string; data: { display_name: string } };
    }): PromiseLike<{ data: { session: unknown | null }; error: ServerError }>;
    signInWithPassword(args: { email: string; password: string }): PromiseLike<{ data: unknown; error: ServerError }>;
    resend(args: { type: "signup"; email: string; options: { emailRedirectTo: string } }): PromiseLike<{ error: ServerError }>;
    resetPasswordForEmail(email: string, options: { redirectTo: string }): PromiseLike<{ error: ServerError }>;
    updateUser(attrs: { password: string }): PromiseLike<{ error: ServerError }>;
  };
}

export type AuthErrorCode = "invalid-credentials" | "email-not-confirmed" | "weak-password" | "rate-limited" | "other";

/** An auth failure the screens can explain in plain words. */
export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function toAuthError(e: NonNullable<ServerError>): AuthError {
  if (e.code === "invalid_credentials" || /invalid login credentials/i.test(e.message)) return new AuthError("invalid-credentials", e.message);
  if (e.code === "email_not_confirmed" || /email not confirmed/i.test(e.message)) return new AuthError("email-not-confirmed", e.message);
  if (e.code === "weak_password") return new AuthError("weak-password", e.message);
  if (e.status === 429 || e.code === "over_email_send_rate_limit" || e.code === "over_request_rate_limit") return new AuthError("rate-limited", e.message);
  return new AuthError("other", e.message);
}

function checkPassword(password: string): void {
  const check = validatePassword(password);
  if (!check.ok) throw new AuthError("weak-password", check.reason);
}

export function createAuthApi(client: PasswordClient) {
  return {
    /**
     * Creates the account. The email link only confirms the address (it is single-use and expires); after that the
     * person signs in with their password. The name is stored with the account and becomes the profile name.
     */
    async signUp(args: { email: string; password: string; name: string; redirectTo: string }): Promise<{ confirmationNeeded: boolean }> {
      checkPassword(args.password);
      const { data, error } = await client.auth.signUp({
        email: args.email,
        password: args.password,
        options: { emailRedirectTo: args.redirectTo, data: { display_name: args.name } },
      });
      if (error) throw toAuthError(error);
      return { confirmationNeeded: data.session === null };
    },

    async signIn(args: { email: string; password: string }): Promise<void> {
      const { error } = await client.auth.signInWithPassword({ email: args.email, password: args.password });
      if (error) throw toAuthError(error);
    },

    /** Sends a fresh confirmation link (the old one stops working). */
    async resendConfirmation(args: { email: string; redirectTo: string }): Promise<void> {
      const { error } = await client.auth.resend({ type: "signup", email: args.email, options: { emailRedirectTo: args.redirectTo } });
      if (error) throw toAuthError(error);
    },

    /** Emails a reset link. It never reveals whether the address has an account. */
    async requestPasswordReset(args: { email: string; redirectTo: string }): Promise<void> {
      const { error } = await client.auth.resetPasswordForEmail(args.email, { redirectTo: args.redirectTo });
      if (error) throw toAuthError(error);
    },

    /** Sets a new password for whoever is signed in (the reset link signs them in first). */
    async updatePassword(password: string): Promise<void> {
      checkPassword(password);
      const { error } = await client.auth.updateUser({ password });
      if (error) throw toAuthError(error);
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
