import "server-only";
import nodemailer from "nodemailer";

/** SMTP settings come from the environment (.env): SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE. */
export function mailConfig() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT) || 587;
  return {
    host,
    port,
    // Port 465 uses TLS from the start; 587 upgrades with STARTTLS.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: { user, pass },
    from: process.env.SMTP_FROM || user,
  };
}

export async function sendMail(msg: { to: string[]; subject: string; text: string; html: string }) {
  const cfg = mailConfig();
  if (!cfg) throw new Error("Email isn’t set up: add SMTP_HOST, SMTP_USER and SMTP_PASS to .env.");
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  await transport.sendMail({ from: cfg.from, to: msg.to.join(", "), subject: msg.subject, text: msg.text, html: msg.html });
}
