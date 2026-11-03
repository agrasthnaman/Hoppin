/** The slice of the Supabase auth client used here, so it can be faked in tests. */
export interface OtpClient {
  auth: {
    signInWithOtp(args: {
      email: string;
      options: { emailRedirectTo: string; data: { display_name: string }; shouldCreateUser: boolean };
    }): PromiseLike<{ error: { message: string } | null }>;
  };
}

export interface MagicLinkRequest {
  email: string;
  name: string;
  redirectTo: string;
}

export function createAuthApi(client: OtpClient) {
  return {
    /** Emails a one-time sign-in link. The name is stored with the new account and becomes the profile name. */
    async sendMagicLink({ email, name, redirectTo }: MagicLinkRequest): Promise<void> {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, data: { display_name: name }, shouldCreateUser: true },
      });
      if (error) throw new Error(error.message);
    },
  };
}
