import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass,
      },
    });
  }

  return transporter;
}

export async function sendEmail({ to, subject, text, html }) {
  if (!env.emailAlertsEnabled) {
    return;
  }

  if (!to || !subject || (!text && !html)) {
    throw new Error('Invalid email payload');
  }

  if (!env.smtpHost || !env.smtpUser || !env.smtpPass || !env.mailFrom) {
    throw new Error('SMTP configuration missing');
  }

  await getTransporter().sendMail({
    from: env.mailFrom,
    to,
    subject,
    text,
    html,
  });
}
