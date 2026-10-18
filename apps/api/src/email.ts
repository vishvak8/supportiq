import { Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  get enabled() {
    return (process.env.MAIL_MODE || 'smtp') !== 'disabled';
  }
  private readonly host =
    process.env.SMTP_HOST ||
    (process.env.NODE_ENV === 'production' ? '' : '127.0.0.1');
  private readonly port = Number(
    process.env.SMTP_PORT ||
      (process.env.NODE_ENV === 'production' ? 587 : 1025),
  );
  private readonly transport = nodemailer.createTransport({
    host: this.host,
    port: this.port,
    secure: this.port === 465,
    requireTLS: process.env.NODE_ENV === 'production',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });

  async send(to: string, subject: string, text: string) {
    if (!this.enabled)
      throw new Error('Email delivery is disabled for this deployment');
    if (!this.host)
      throw new Error('SMTP_HOST must be configured for production email');
    await this.transport.sendMail({
      from: process.env.SMTP_FROM || 'SupportIQ <support@localhost>',
      to,
      subject,
      text,
    });
  }
}
