/** Passwords: long enough to resist guessing, no composition rules (length matters more than symbols). */
export const MIN_PASSWORD_LENGTH = 10;
/** bcrypt, which the auth service uses, only reads the first 72 bytes. */
export const MAX_PASSWORD_LENGTH = 72;

export type PasswordCheck = { ok: true } | { ok: false; reason: string };

export function validatePassword(password: string): PasswordCheck {
  if (password.trim().length === 0 || [...password].length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `Use at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_LENGTH) {
    return { ok: false, reason: `Use at most ${MAX_PASSWORD_LENGTH} characters` };
  }
  return { ok: true };
}
