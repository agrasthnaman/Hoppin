import { validatePassword } from "@hoppin/core";

/** The kinds of emailed link that come back to the app. */
export type EmailLinkType = "signup" | "recovery" | "invite";

type ServerError = { code?: string; message: string; status?: number } | null;

/** The slice of the Supabase auth client used here, so it can be faked in tests. */
export interface PasswordClient {
  auth: {
    signUp(args: {
      email: string;
      password: string;
      options: { emailRedirectTo: string; data: { display_name: string }; captchaToken?: string };
    }): PromiseLike<{ data: { session: unknown | null; user?: { identities?: unknown[] | null } | null }; error: ServerError }>;
    signInWithPassword(args: { email: string; password: string; options?: { captchaToken?: string } }): PromiseLike<{ data: unknown; error: ServerError }>;
    resend(args: { type: "signup"; email: string; options: { emailRedirectTo: string; captchaToken?: string } }): PromiseLike<{ error: ServerError }>;
    resetPasswordForEmail(email: string, options: { redirectTo: string; captchaToken?: string }): PromiseLike<{ error: ServerError }>;
    updateUser(attrs: { password: string }): PromiseLike<{ error: ServerError }>;
    verifyOtp(args: { token_hash: string; type: EmailLinkType }): PromiseLike<{ error: ServerError }>;
  };
  /** Calls a database function (used for the sign-up queue). */
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: ServerError }>;
  /** Calls an Edge Function. A refusal carries the HTTP response as `context`. */
  functions: {
    invoke(name: string, options: { body: Record<string, unknown> }): PromiseLike<{ data: unknown; error: { message: string; context?: { status?: number } } | null }>;
  };
}

/** Where an email stands in the sign-up queue (see docs/signup-queue.md). */
export type QueueStatus = "none" | "waiting" | "invited" | "registered";
/** What happened when someone asked to be put in the queue. */
export type QueueJoin = "queued" | "already_queued" | "registered" | "full";

const QUEUE_STATUS: readonly QueueStatus[] = ["none", "waiting", "invited", "registered"];
const QUEUE_JOIN: readonly QueueJoin[] = ["queued", "already_queued", "registered", "full"];

function queueAnswer<T extends string>(data: unknown, allowed: readonly T[]): T {
  const status = typeof data === "object" && data !== null && "status" in data ? (data as { status: unknown }).status : null;
  const found = allowed.find((value) => value === status);
  if (!found) throw new AuthError("other", "unexpected answer from the queue");
  return found;
}

export type AuthErrorCode = "invalid-credentials" | "email-not-confirmed" | "weak-password" | "rate-limited" | "invalid-link" | "already-registered" | "captcha" | "other";

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
  if (e.code === "captcha_failed" || /captcha/i.test(e.message)) return new AuthError("captcha", e.message);
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
    async signUp(args: { email: string; password: string; name: string; redirectTo: string; captchaToken?: string }): Promise<{ confirmationNeeded: boolean }> {
      checkPassword(args.password);
      const { data, error } = await client.auth.signUp({
        email: args.email,
        password: args.password,
        options: { emailRedirectTo: args.redirectTo, data: { display_name: args.name }, ...(args.captchaToken ? { captchaToken: args.captchaToken } : {}) },
      });
      if (error) throw toAuthError(error);
      // For an address that already has an account the service answers as if sign-up worked, but sends no email and
      // gives back an account with no identities. Say so, instead of leaving the person waiting for a mail that never comes.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new AuthError("already-registered", "This email already has an account");
      }
      return { confirmationNeeded: data.session === null };
    },

    /** Is this email already waiting in the queue (or already registered)? Never throws for "not found". */
    async queueStatus(email: string): Promise<QueueStatus> {
      const { data, error } = await client.rpc("signup_queue_status", { p_email: email });
      if (error) throw toAuthError(error);
      return queueAnswer(data, QUEUE_STATUS);
    },

    /**
     * Saves a spot in the queue. Only the email, name and a bot-check token are sent, never the password. The server
     * refuses without a good token. Safe to repeat.
     */
    async joinQueue(args: { email: string; name: string; captchaToken?: string }): Promise<QueueJoin> {
      const { data, error } = await client.functions.invoke("join-signup-queue", {
        body: { email: args.email, name: args.name, ...(args.captchaToken ? { captchaToken: args.captchaToken } : {}) },
      });
      if (error) throw new AuthError(error.context?.status === 403 ? "captcha" : "other", error.message);
      return queueAnswer(data, QUEUE_JOIN);
    },

    async signIn(args: { email: string; password: string; captchaToken?: string }): Promise<void> {
      const { error } = await client.auth.signInWithPassword({ email: args.email, password: args.password, ...(args.captchaToken ? { options: { captchaToken: args.captchaToken } } : {}) });
      if (error) throw toAuthError(error);
    },

    /** Sends a fresh confirmation link (the old one stops working). */
    async resendConfirmation(args: { email: string; redirectTo: string; captchaToken?: string }): Promise<void> {
      const { error } = await client.auth.resend({ type: "signup", email: args.email, options: { emailRedirectTo: args.redirectTo, ...(args.captchaToken ? { captchaToken: args.captchaToken } : {}) } });
      if (error) throw toAuthError(error);
    },

    /** Emails a reset link. It never reveals whether the address has an account. */
    async requestPasswordReset(args: { email: string; redirectTo: string; captchaToken?: string }): Promise<void> {
      const { error } = await client.auth.resetPasswordForEmail(args.email, { redirectTo: args.redirectTo, ...(args.captchaToken ? { captchaToken: args.captchaToken } : {}) });
      if (error) throw toAuthError(error);
    },

    /**
     * Confirms the token from an emailed link (which points at our own address, not the auth provider's). This
     * signs the person in. It is only done when the page runs, so mail scanners that merely fetch the link
     * cannot use it up.
     */
    async verifyEmailLink(args: { tokenHash: string; type: EmailLinkType }): Promise<void> {
      const { error } = await client.auth.verifyOtp({ token_hash: args.tokenHash, type: args.type });
      if (error) throw error.status === 429 ? toAuthError(error) : new AuthError("invalid-link", error.message);
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
