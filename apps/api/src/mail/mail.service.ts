import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private config: ConfigService) {}

  private getTransporter(): nodemailer.Transporter {
    if (this.transporter) return this.transporter;

    const host = this.config.get<string>('SMTP_HOST');
    if (!host) {
      throw new Error('SMTP_HOST não configurado');
    }

    const port = Number(this.config.get('SMTP_PORT', '587'));
    const secure = this.config.get('SMTP_SECURE', 'false') === 'true';
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });

    return this.transporter;
  }

  async sendVerificationCode(email: string, code: string): Promise<void> {
    const from = this.config.get('MAIL_FROM', 'Concord <noreply@concord.local>');
    const transporter = this.getTransporter();

    await transporter.sendMail({
      from,
      to: email,
      subject: 'Código de verificação — Concord',
      text: `Seu código de verificação Concord é: ${code}\n\nEle expira em 15 minutos.`,
      html: `<p>Seu código de verificação Concord é:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>Ele expira em 15 minutos.</p>`,
    });

    this.logger.log(`Código de verificação enviado para ${email}`);
  }
}
