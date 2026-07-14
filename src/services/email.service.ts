import nodemailer from "nodemailer";
import env from "../config/env.js";

export class EmailService {
  private static transporter: nodemailer.Transporter | null = null;

  private static getTransporter() {
    if (this.transporter) return this.transporter;

    if (env.SMTP_USER && env.SMTP_PASS) {
      this.transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });
      return this.transporter;
    }

    return null;
  }

  public static async sendEmail(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ): Promise<boolean> {
    const transporter = this.getTransporter();

    console.info(`========================================`);
    console.info(`EMAIL SIMULATION (TO: ${to})`);
    console.info(`SUBJECT: ${subject}`);
    console.info(`BODY:`);
    console.info(text);
    console.info(`========================================`);

    if (transporter) {
      try {
        await transporter.sendMail({
          from: env.SMTP_FROM || env.SMTP_USER,
          to,
          subject,
          text,
          html: html || text.replace(/\n/g, "<br/>"),
        });
        console.info(`Email successfully sent to ${to} via SMTP.`);
        return true;
      } catch (error) {
        console.error(`Failed to send email via SMTP:`, error);
        return false;
      }
    } else {
      console.info(`SMTP configuration missing. Email simulated only.`);
      return true;
    }
  }

  public static async sendOtpEmail(
    to: string,
    otp: string,
    purpose: "forgot_password" | "2fa",
  ): Promise<boolean> {
    const subject =
      purpose === "forgot_password"
        ? "Pristine - Reset Password OTP"
        : "Pristine - Two-Factor Authentication (2FA) Code";

    const text =
      purpose === "forgot_password"
        ? `Hello,\n\nYou requested to reset your password. Please use the following One-Time Password (OTP) to complete the reset process:\n\n${otp}\n\nThis OTP is valid for 10 minutes. If you did not request this, please ignore this email.`
        : `Hello,\n\nYour Two-Factor Authentication (2FA) verification code is:\n\n${otp}\n\nThis code is valid for 10 minutes. If you did not request this code, please secure your account.`;

    return this.sendEmail(to, subject, text);
  }
}
