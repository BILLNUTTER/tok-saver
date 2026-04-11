import nodemailer from "nodemailer";
import { logger } from "./logger";

const SENDER = "nutterxtech@gmail.com";
const APP_NAME = "TokSaver";
const APP_URL = process.env.APP_URL || "https://toksaver.replit.app";

function getTransporter() {
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!pass) {
    logger.warn("GMAIL_APP_PASSWORD not set — emails will be skipped");
    return null;
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: SENDER, pass: pass.replace(/\s/g, "") },
  });
}

function wrapHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#141414;border-radius:16px;border:1px solid #222;overflow:hidden;max-width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a0010,#0a0a0a);padding:32px 40px;text-align:center;border-bottom:1px solid #222;">
            <span style="font-size:26px;font-weight:900;color:#fff;letter-spacing:-0.5px;">
              <span style="color:#FF1A81;">Tok</span>Saver
            </span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;color:#e0e0e0;font-size:15px;line-height:1.7;">
            ${bodyHtml}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #222;text-align:center;color:#555;font-size:12px;">
            &copy; ${new Date().getFullYear()} ${APP_NAME} &mdash; Download TikTok videos without watermarks.<br>
            Questions? Reply to this email or contact <a href="mailto:${SENDER}" style="color:#FF1A81;">${SENDER}</a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendWelcomeEmail(name: string, email: string): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) return;

  const firstName = name.split(" ")[0];
  const html = wrapHtml("Welcome to TokSaver!", `
    <h2 style="margin:0 0 16px;color:#fff;font-size:22px;">Hey ${firstName}, welcome! 🎬</h2>
    <p style="margin:0 0 16px;color:#aaa;">Your TokSaver account is ready. You get <strong style="color:#FF1A81;">1 free download</strong> to try it out — no payment needed.</p>
    <p style="margin:0 0 24px;color:#aaa;">Just paste any TikTok link and we'll deliver a clean, watermark-free video in seconds.</p>

    <div style="text-align:center;margin:28px 0;">
      <a href="${APP_URL}" style="display:inline-block;background:#FF1A81;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 36px;border-radius:10px;">
        Start Downloading Free →
      </a>
    </div>

    <div style="background:#1e1e1e;border-radius:12px;padding:20px 24px;margin:24px 0;">
      <p style="margin:0 0 12px;color:#fff;font-weight:700;font-size:14px;">Upgrade for unlimited access:</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;color:#aaa;font-size:14px;">📅 Weekly Pro</td>
          <td style="text-align:right;color:#FF1A81;font-weight:700;font-size:14px;">KSH 19/week</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#aaa;font-size:14px;">📆 Monthly Pro</td>
          <td style="text-align:right;color:#FF1A81;font-weight:700;font-size:14px;">KSH 49/month</td>
        </tr>
      </table>
      <p style="margin:12px 0 0;color:#666;font-size:12px;">Paid instantly via M-Pesa. No cards, no hassle.</p>
    </div>

    <p style="margin:0;color:#666;font-size:13px;">Have questions? Just reply to this email — we're happy to help.</p>
  `);

  try {
    await transporter.sendMail({
      from: `"${APP_NAME}" <${SENDER}>`,
      to: email,
      subject: `Welcome to TokSaver — Your free download is waiting 🎬`,
      html,
    });
    logger.info({ email }, "Welcome email sent");
  } catch (err) {
    logger.error({ err, email }, "Failed to send welcome email");
  }
}

export async function sendDailyReminderEmail(name: string, email: string, hasFreeDl: boolean): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) return;

  const firstName = name.split(" ")[0];

  const bodyHtml = hasFreeDl
    ? `
      <h2 style="margin:0 0 16px;color:#fff;font-size:22px;">Hey ${firstName}! 👋</h2>
      <p style="margin:0 0 16px;color:#aaa;">You still have a <strong style="color:#FF1A81;">free download</strong> waiting for you on TokSaver.</p>
      <p style="margin:0 0 24px;color:#aaa;">Grab any TikTok video — clean, watermark-free, ready to share.</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${APP_URL}" style="display:inline-block;background:#FF1A81;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 36px;border-radius:10px;">
          Use My Free Download →
        </a>
      </div>
    `
    : `
      <h2 style="margin:0 0 16px;color:#fff;font-size:22px;">Hey ${firstName}! 👋</h2>
      <p style="margin:0 0 16px;color:#aaa;">Missing your TikTok downloads? Upgrade to Pro and get <strong style="color:#FF1A81;">unlimited</strong> watermark-free videos.</p>
      <div style="background:#1e1e1e;border-radius:12px;padding:20px 24px;margin:20px 0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:6px 0;color:#aaa;font-size:14px;">📅 Weekly Pro</td>
            <td style="text-align:right;color:#FF1A81;font-weight:700;font-size:14px;">KSH 19/week</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#aaa;font-size:14px;">📆 Monthly Pro</td>
            <td style="text-align:right;color:#FF1A81;font-weight:700;font-size:14px;">KSH 49/month</td>
          </tr>
        </table>
        <p style="margin:12px 0 0;color:#666;font-size:12px;">Paid via M-Pesa — instant activation.</p>
      </div>
      <div style="text-align:center;margin:28px 0;">
        <a href="${APP_URL}/subscribe" style="display:inline-block;background:#FF1A81;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 36px;border-radius:10px;">
          Upgrade to Pro →
        </a>
      </div>
    `;

  try {
    await transporter.sendMail({
      from: `"${APP_NAME}" <${SENDER}>`,
      to: email,
      subject: hasFreeDl
        ? `${firstName}, your free TikTok download is waiting 🎬`
        : `Get unlimited TikTok downloads — upgrade to Pro 🚀`,
      html: wrapHtml("Daily Reminder", bodyHtml),
    });
    logger.info({ email }, "Daily reminder email sent");
  } catch (err) {
    logger.error({ err, email }, "Failed to send daily reminder email");
  }
}
