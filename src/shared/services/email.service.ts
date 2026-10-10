import nodemailer from "nodemailer";
import env from "../../config/env.js";
import logger from "../../lib/logger.js";

function parseEmailAddress(raw: string): { email: string; name?: string } {
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    const name = match[1].trim().replace(/^["']|["']$/g, "");
    const email = match[2].trim();
    return name ? { name, email } : { email };
  }
  return { email: raw.trim() };
}

export class EmailServiceImpl {
  private transporter: nodemailer.Transporter | null = null;
  private isConfigured: boolean = false;

  constructor() {
    this.initTransporter();
  }

  private initTransporter() {
    const smtpService = env.SMTP_SERVICE || process.env.SMTP_SERVICE;
    const smtpHost = env.SMTP_HOST || process.env.SMTP_HOST;
    const smtpPort =
      env.SMTP_PORT ||
      (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587);
    const smtpSecure =
      env.SMTP_SECURE || process.env.SMTP_SECURE === "true" || smtpPort === 465;
    const smtpUser = env.SMTP_USER || process.env.SMTP_USER;
    const smtpPass = env.SMTP_PASS || process.env.SMTP_PASS;

    const isPlaceholder = (val?: string) =>
      !val ||
      val === "asdfasd" ||
      val === "replace-me" ||
      val.includes("your-");

    if (!isPlaceholder(smtpUser) && !isPlaceholder(smtpPass)) {
      if (smtpService === "gmail" || smtpHost === "smtp.gmail.com") {
        this.transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });
        this.isConfigured = true;
      } else if (smtpHost && !isPlaceholder(smtpHost)) {
        this.transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });
        this.isConfigured = true;
      }
    }

    if (env.BREVO_API_KEY) {
      logger.info("EmailService initialized with Brevo REST API provider.");
    } else if (this.isConfigured && this.transporter) {
      logger.info("EmailService initialized with active SMTP transport.");
      this.transporter.verify((err) => {
        if (err) {
          logger.error(
            "SMTP transporter verification failed. Real emails may fail to send.",
            err,
          );
        } else {
          logger.info(
            "SMTP transporter verified successfully. Ready to send emails.",
          );
        }
      });
    } else {
      logger.warn(
        "Mailing configuration missing or placeholder in .env. EmailService running in MOCK mode (emails logged to console).",
      );
    }
  }

  /**
   * Dispatches email via Brevo's v3 HTTP API (matching qrcos brevo-provider)
   */
  private async sendViaBrevo(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const apiKey = env.BREVO_API_KEY || process.env.BREVO_API_KEY;
    if (!apiKey) return { success: false, error: "BREVO_API_KEY missing" };

    const rawSender =
      env.EMAIL_FROM || env.SMTP_FROM || "nairadityasunil@gmail.com";
    const sender = parseEmailAddress(rawSender);
    if (!sender.name) sender.name = "Pristine";

    const recipient = parseEmailAddress(to);

    const payload: Record<string, unknown> = {
      sender,
      to: [recipient],
      subject,
    };
    if (html) payload.htmlContent = html;
    if (text) payload.textContent = text;

    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(
          `[Brevo] API call failed with status ${response.status}: ${errorText}`,
        );

        if (response.status === 401 && errorText.includes("authorised_ips")) {
          logger.warn(
            "[Brevo] Brevo IP authorization required: visit https://app.brevo.com/security/authorised_ips to whitelist this IP.",
          );
        }

        return { success: false, error: errorText };
      }

      const data = (await response.json()) as { messageId?: string };
      logger.info(
        `[Brevo] Email sent successfully -> ID: ${data.messageId || "N/A"} | To: ${to}`,
      );
      return { success: true, messageId: data.messageId };
    } catch (err) {
      logger.error(
        `[Brevo] Email dispatch failure -> To: ${to} | Error:`,
        err as Error,
      );
      return { success: false, error: (err as Error).message };
    }
  }

  public async sendEmail(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ): Promise<boolean> {
    // 1. Prioritize Brevo API if configured
    if (env.BREVO_API_KEY) {
      const brevoRes = await this.sendViaBrevo(to, subject, text, html);
      if (brevoRes.success) {
        return true;
      }
      logger.warn(
        `[EmailService] Brevo delivery failed: ${brevoRes.error}. Attempting fallback...`,
      );
    }

    // 2. Try Nodemailer SMTP if configured
    if (this.transporter && this.isConfigured) {
      try {
        const fromAddress =
          env.SMTP_FROM && !env.SMTP_FROM.includes("asdfasd")
            ? env.SMTP_FROM
            : env.SMTP_USER && !env.SMTP_USER.includes("asdfasd")
              ? `"Pristine" <${env.SMTP_USER}>`
              : `"Pristine" <no-reply@pristine.app>`;

        await this.transporter.sendMail({
          from: fromAddress,
          to,
          subject,
          text,
          html: html || text,
        });
        logger.info(`Email sent successfully via SMTP to ${to}`);
        return true;
      } catch (error) {
        logger.error("Failed to send email via SMTP", error as Error);
      }
    }

    // 3. Fallback to mock log
    logger.info(`[MOCK EMAIL] To: ${to} | Subject: ${subject}`);
    return true;
  }

  public async sendOtpEmail(
    to: string,
    otp: string,
    type: "2fa" | "forgot_password" | string,
  ): Promise<boolean> {
    const subject =
      type === "2fa" ? "Your 2FA Verification Code" : "Your Password Reset OTP";
    const text = `Your OTP code is: ${otp}`;
    const html = `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>${subject}</h2>
        <p>Your verification code is: <strong style="font-size: 20px;">${otp}</strong></p>
      </div>
    `;
    return this.sendEmail(to, subject, text, html);
  }

  public async sendInvitationEmail(
    to: string,
    inviterName: string,
    workspaceName: string,
    invitationToken: string,
  ): Promise<boolean> {
    const clientUrl = env.FRONTEND_BASE_URL || "http://localhost:5173";
    const inviteUrl = `${clientUrl}/register?token=${invitationToken}&email=${encodeURIComponent(to)}`;
    const subject = `${inviterName} invited you to join ${workspaceName} on Pristine`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e7e5e4; border-radius: 16px; background-color: #ffffff; color: #1c1917;">
        <div style="margin-bottom: 24px;">
          <h2 style="color: #14532d; font-size: 24px; font-weight: 700; margin: 0 0 8px 0;">You're invited to join ${workspaceName}</h2>
          <p style="color: #78716c; font-size: 14px; margin: 0; line-height: 1.5;"><strong>${inviterName}</strong> has invited you to collaborate in their workspace <strong>${workspaceName}</strong> on Pristine.</p>
        </div>
        <div style="margin: 28px 0;">
          <a href="${inviteUrl}" style="background-color: #166534; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px; display: inline-block;">Create Account & Join Workspace</a>
        </div>
        <p style="color: #a8a29e; font-size: 13px; margin: 20px 0 0 0; line-height: 1.5;">
          Click the button above or copy and paste this link into your browser to sign up:<br/>
          <a href="${inviteUrl}" style="color: #166534; word-break: break-all;">${inviteUrl}</a>
        </p>
      </div>
    `;
    const text = `${inviterName} invited you to join ${workspaceName} on Pristine. Create your account and join: ${inviteUrl}`;

    logger.info(
      `[INVITATION EMAIL DISPATCH] Recipient: ${to} | Workspace: ${workspaceName} | Invited by: ${inviterName} | Link: ${inviteUrl}`,
    );

    return this.sendEmail(to, subject, text, html);
  }

  public get isReady(): boolean {
    return (
      Boolean(env.BREVO_API_KEY) ||
      (this.isConfigured && Boolean(this.transporter))
    );
  }
}

export const EmailService = new EmailServiceImpl();
export default EmailService;
