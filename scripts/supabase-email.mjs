// Applies Hoppin's email setup to a Supabase project through the Management API.
//
//   Templates only (Supabase only allows this AFTER a custom email provider is set up, see the smtp step):
//     SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=abc node scripts/supabase-email.mjs templates
//
//   Sign-in settings (password rules and how long email links last), works on any plan:
//     SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=abc node scripts/supabase-email.mjs auth
//
//   Custom email provider (for example Resend), so a whole group can sign in:
//     SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=abc \
//     SMTP_HOST=smtp.resend.com SMTP_PORT=465 SMTP_USER=resend SMTP_PASS=re_... \
//     SENDER_EMAIL=noreply@yourdomain.com SENDER_NAME=Hoppin EMAILS_PER_HOUR=100 \
//     node scripts/supabase-email.mjs smtp
//
// Secrets are read from the environment only and are never written to a file.
import { readFileSync } from "node:fs";

const mode = process.argv[2];
const need = (name) => {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
  return v;
};
const token = need("SUPABASE_ACCESS_TOKEN");
const ref = need("SUPABASE_PROJECT_REF");
const file = (name) => readFileSync(new URL(`../supabase/email-templates/${name}`, import.meta.url), "utf8");

let body;
if (mode === "templates") {
  body = {
    mailer_subjects_confirmation: "You're on the list. Your Hoppin invite",
    mailer_templates_confirmation_content: file("confirm-signup.html"),
    mailer_subjects_recovery: "Choose a new Hoppin password",
    mailer_templates_recovery_content: file("recovery.html"),
  };
} else if (mode === "auth") {
  // Links are single-use (Supabase default) and valid for 24 hours; passwords need at least 10 characters.
  body = { mailer_otp_exp: 86400, password_min_length: 10, mailer_autoconfirm: false };
} else if (mode === "smtp") {
  body = {
    external_email_enabled: true,
    smtp_host: need("SMTP_HOST"),
    smtp_port: need("SMTP_PORT"),
    smtp_user: need("SMTP_USER"),
    smtp_pass: need("SMTP_PASS"),
    smtp_admin_email: need("SENDER_EMAIL"),
    smtp_sender_name: process.env.SENDER_NAME ?? "Hoppin",
    rate_limit_email_sent: Number(process.env.EMAILS_PER_HOUR ?? 100),
  };
} else {
  console.error("Usage: node scripts/supabase-email.mjs auth|templates|smtp");
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
if (!res.ok) {
  console.error(`Failed: HTTP ${res.status} ${await res.text()}`);
  process.exit(1);
}
const after = await res.json();
console.log(mode === "auth"
  ? { mailer_otp_exp: after.mailer_otp_exp, password_min_length: after.password_min_length, mailer_autoconfirm: after.mailer_autoconfirm }
  : mode === "smtp"
  ? { smtp_host: after.smtp_host, smtp_admin_email: after.smtp_admin_email, rate_limit_email_sent: after.rate_limit_email_sent }
  : { subject_confirmation: after.mailer_subjects_confirmation, subject_recovery: after.mailer_subjects_recovery });
