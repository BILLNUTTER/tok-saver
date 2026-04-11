import nodemailer from "nodemailer";
import { logger } from "./logger";

const SENDER = "nutterxtech@gmail.com";
const APP_NAME = "TokSaver";
const APP_URL = process.env.APP_URL || "https://tok-saver.vercel.app";

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

// ─── Base Layout ─────────────────────────────────────────────────────────────

function layout(bodyHtml: string): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);max-width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#111111;padding:24px 40px;text-align:center;">
            <span style="font-size:22px;font-weight:900;letter-spacing:-0.5px;color:#ffffff;">
              <span style="color:#FF1A81;">Tok</span>Saver
            </span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 28px;color:#1a1a1a;font-size:15px;line-height:1.65;">
            ${bodyHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px 28px;border-top:1px solid #e8e8e8;text-align:center;color:#999;font-size:12px;line-height:1.6;">
            &copy; ${year} ${APP_NAME} &mdash; Watermark-free TikTok downloads<br>
            Questions? <a href="mailto:${SENDER}" style="color:#FF1A81;text-decoration:none;">${SENDER}</a>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Shared Components ────────────────────────────────────────────────────────

function ctaButton(label: string, url: string): string {
  return `
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${url}"
         style="display:inline-block;background:#FF1A81;color:#ffffff;text-decoration:none;
                font-weight:700;font-size:15px;padding:14px 40px;border-radius:8px;
                letter-spacing:0.2px;">
        ${label}
      </a>
    </div>`;
}

function pricingBox(): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#fafafa;border:1px solid #e8e8e8;border-radius:8px;margin:24px 0;padding:0;">
      <tr>
        <td style="padding:16px 20px 8px;">
          <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.6px;">Pro Plans</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:7px 0;font-size:14px;color:#333;border-bottom:1px solid #eee;">Weekly Pro</td>
              <td style="padding:7px 0;font-size:14px;font-weight:700;color:#FF1A81;text-align:right;border-bottom:1px solid #eee;">KSH 19 / week</td>
            </tr>
            <tr>
              <td style="padding:7px 0;font-size:14px;color:#333;">Monthly Pro</td>
              <td style="padding:7px 0;font-size:14px;font-weight:700;color:#FF1A81;text-align:right;">KSH 49 / month</td>
            </tr>
          </table>
          <p style="margin:12px 0 16px;font-size:12px;color:#999;">Paid via M-Pesa &mdash; instant activation, no card needed.</p>
        </td>
      </tr>
    </table>`;
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid #e8e8e8;margin:24px 0;">`;
}

// ─── Welcome Email ────────────────────────────────────────────────────────────

export async function sendWelcomeEmail(name: string, email: string): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) return;

  const firstName = name.split(" ")[0];

  const body = `
    <h2 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#111;">Welcome to TokSaver, ${firstName}.</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#888;">Your account is ready — let's get your first video.</p>

    ${divider()}

    <p style="margin:0 0 14px;color:#333;">
      You have <strong style="color:#FF1A81;">1 free download</strong> waiting for you. No payment, no credit card required.
    </p>

    <p style="margin:0 0 14px;color:#333;">
      Here's how it works in 3 steps:
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr>
        <td style="padding:8px 12px;font-size:14px;color:#333;">
          <span style="display:inline-block;background:#FF1A81;color:#fff;border-radius:50%;width:22px;height:22px;text-align:center;line-height:22px;font-weight:700;font-size:12px;margin-right:10px;">1</span>
          Copy any TikTok video link
        </td>
      </tr>
      <tr>
        <td style="padding:8px 12px;font-size:14px;color:#333;">
          <span style="display:inline-block;background:#FF1A81;color:#fff;border-radius:50%;width:22px;height:22px;text-align:center;line-height:22px;font-weight:700;font-size:12px;margin-right:10px;">2</span>
          Paste it into TokSaver
        </td>
      </tr>
      <tr>
        <td style="padding:8px 12px;font-size:14px;color:#333;">
          <span style="display:inline-block;background:#FF1A81;color:#fff;border-radius:50%;width:22px;height:22px;text-align:center;line-height:22px;font-weight:700;font-size:12px;margin-right:10px;">3</span>
          Download — clean, watermark-free
        </td>
      </tr>
    </table>

    ${ctaButton("Use My Free Download →", APP_URL)}

    ${divider()}

    <p style="margin:0 0 4px;font-size:14px;color:#555;font-weight:600;">Want unlimited downloads?</p>
    <p style="margin:0 0 16px;font-size:14px;color:#777;">Upgrade to Pro anytime. Affordable weekly or monthly plans, paid via M-Pesa.</p>

    ${pricingBox()}

    <p style="margin:0;font-size:13px;color:#aaa;">Need help? Just reply to this email — we respond quickly.</p>
  `;

  try {
    await transporter.sendMail({
      from: `"${APP_NAME}" <${SENDER}>`,
      to: email,
      subject: `Welcome to TokSaver — your free download is ready`,
      html: layout(body),
    });
    logger.info({ email }, "Welcome email sent");
  } catch (err) {
    logger.error({ err, email }, "Failed to send welcome email");
  }
}

// ─── Password Reset OTP ───────────────────────────────────────────────────────

export async function sendResetCodeEmail(
  name: string,
  email: string,
  code: string
): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) return;

  const firstName = name.split(" ")[0];

  const body = `
    <h2 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#111;">Password reset request</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#888;">Hi ${firstName}, we received a request to reset your TokSaver password.</p>

    ${divider()}

    <p style="margin:0 0 16px;color:#333;">
      Enter the code below to verify it's you. It expires in <strong>15 minutes</strong>.
    </p>

    <div style="text-align:center;margin:28px 0;">
      <div style="display:inline-block;background:#f4f4f5;border:2px solid #e8e8e8;border-radius:12px;padding:20px 40px;">
        <span style="font-size:36px;font-weight:900;letter-spacing:0.35em;color:#111;font-family:'Courier New',monospace;">${code}</span>
      </div>
    </div>

    ${divider()}

    <p style="margin:0 0 8px;font-size:14px;color:#555;">
      Once verified, you'll be able to set a new password on the site.
    </p>
    <p style="margin:0;font-size:13px;color:#aaa;">
      If you did not request this, you can safely ignore this email — your password will not change.
    </p>
  `;

  try {
    await transporter.sendMail({
      from: `"${APP_NAME}" <${SENDER}>`,
      to: email,
      subject: `Your TokSaver password reset code: ${code}`,
      html: layout(body),
    });
    logger.info({ email }, "Password reset code email sent");
  } catch (err) {
    logger.error({ err, email }, "Failed to send reset code email");
  }
}

// ─── Morning Reminder (8–9 AM EAT) ───────────────────────────────────────────

export async function sendMorningReminderEmail(
  name: string,
  email: string,
  hasFreeDl: boolean
): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) return;

  const firstName = name.split(" ")[0];

  const body = hasFreeDl
    ? `
      <h2 style="margin:0 0 6px;font-size:21px;font-weight:800;color:#111;">Good morning, ${firstName}.</h2>
      <p style="margin:0 0 20px;font-size:14px;color:#888;">Start your day with a quick TikTok download.</p>

      ${divider()}

      <p style="margin:0 0 14px;color:#333;">
        Your <strong style="color:#FF1A81;">free download</strong> is still waiting. It takes less than 10 seconds — paste the link and you're done.
      </p>
      <p style="margin:0 0 20px;color:#555;font-size:14px;">
        Save that video you bookmarked, download a tutorial you want to re-watch, or grab content for your own use. No watermark, no quality loss.
      </p>

      ${ctaButton("Download Now →", APP_URL)}

      ${divider()}

      <p style="margin:0;font-size:13px;color:#aaa;">
        Want unlimited downloads every day? <a href="${APP_URL}/subscribe" style="color:#FF1A81;text-decoration:none;font-weight:600;">Upgrade to Pro from KSH 19/week →</a>
      </p>
    `
    : `
      <h2 style="margin:0 0 6px;font-size:21px;font-weight:800;color:#111;">Good morning, ${firstName}.</h2>
      <p style="margin:0 0 20px;font-size:14px;color:#888;">Ready to download more TikTok videos today?</p>

      ${divider()}

      <p style="margin:0 0 14px;color:#333;">
        You've used your free download — great start! Upgrade to <strong>Pro</strong> and get <strong style="color:#FF1A81;">unlimited downloads</strong> every single day.
      </p>
      <p style="margin:0 0 20px;color:#555;font-size:14px;">
        No watermarks, no limits, no hassle. Pay once via M-Pesa and keep downloading.
      </p>

      ${pricingBox()}

      ${ctaButton("Upgrade to Pro →", `${APP_URL}/subscribe`)}

      ${divider()}

      <p style="margin:0;font-size:13px;color:#aaa;">Questions about the plans? Reply to this email — we'll get back to you.</p>
    `;

  try {
    await transporter.sendMail({
      from: `"${APP_NAME}" <${SENDER}>`,
      to: email,
      subject: hasFreeDl
        ? `Good morning, ${firstName} — your free TikTok download is waiting`
        : `Good morning, ${firstName} — download unlimited TikToks today`,
      html: layout(body),
    });
    logger.info({ email, slot: "morning" }, "Reminder email sent");
  } catch (err) {
    logger.error({ err, email }, "Failed to send morning reminder");
  }
}

// ─── Evening Reminder (8–9 PM EAT) ───────────────────────────────────────────

export async function sendEveningReminderEmail(
  name: string,
  email: string,
  hasFreeDl: boolean
): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) return;

  const firstName = name.split(" ")[0];

  const body = hasFreeDl
    ? `
      <h2 style="margin:0 0 6px;font-size:21px;font-weight:800;color:#111;">Good evening, ${firstName}.</h2>
      <p style="margin:0 0 20px;font-size:14px;color:#888;">Before you wind down — save a video you loved today.</p>

      ${divider()}

      <p style="margin:0 0 14px;color:#333;">
        Your <strong style="color:#FF1A81;">free download</strong> is still available. Scrolled past something great today? Now's the time to save it — watermark-free and ready to keep.
      </p>
      <p style="margin:0 0 20px;color:#555;font-size:14px;">
        It only takes a few seconds. Copy the link, paste it in, done.
      </p>

      ${ctaButton("Save a Video Tonight →", APP_URL)}

      ${divider()}

      <p style="margin:0;font-size:13px;color:#aaa;">
        Need unlimited downloads? <a href="${APP_URL}/subscribe" style="color:#FF1A81;text-decoration:none;font-weight:600;">Go Pro from KSH 19/week →</a>
      </p>
    `
    : `
      <h2 style="margin:0 0 6px;font-size:21px;font-weight:800;color:#111;">Good evening, ${firstName}.</h2>
      <p style="margin:0 0 20px;font-size:14px;color:#888;">Saw great TikToks today? Save them all — upgrade to Pro.</p>

      ${divider()}

      <p style="margin:0 0 14px;color:#333;">
        With Pro, there's no limit on how many videos you can download — morning, afternoon, or night.
      </p>
      <p style="margin:0 0 20px;color:#555;font-size:14px;">
        Affordable plans, paid via M-Pesa, activated instantly. Cancel anytime.
      </p>

      ${pricingBox()}

      ${ctaButton("Get Pro Access →", `${APP_URL}/subscribe`)}

      ${divider()}

      <p style="margin:0;font-size:13px;color:#aaa;">Have a question? Just reply — we read every message.</p>
    `;

  try {
    await transporter.sendMail({
      from: `"${APP_NAME}" <${SENDER}>`,
      to: email,
      subject: hasFreeDl
        ? `Good evening, ${firstName} — save a TikTok before bed`
        : `Good evening, ${firstName} — go Pro and never miss a video`,
      html: layout(body),
    });
    logger.info({ email, slot: "evening" }, "Reminder email sent");
  } catch (err) {
    logger.error({ err, email }, "Failed to send evening reminder");
  }
}
