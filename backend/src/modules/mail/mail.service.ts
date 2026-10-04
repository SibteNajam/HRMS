import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface Mail {
  to: string;
  subject: string;
  /** Plain text. The HTML version is generated from it. */
  body: string;
  /** Optional call to action rendered as a button. */
  action?: { label: string; url: string };
}

/**
 * Outbound email, with every send recorded.
 *
 * Two things matter here. Failures are swallowed: an email that cannot be
 * sent must not roll back the thing it was reporting — a candidate is still
 * shortlisted whether or not the message reached them. And every attempt is
 * written to `email_log`, successful or not, because "did we tell them?" is
 * a question somebody asks later and nobody can answer from memory.
 *
 * MAIL_DRY_RUN logs instead of sending. It is the default, so a fresh
 * checkout cannot email real people by accident.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly dryRun: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.dryRun = this.config.get<boolean>('MAIL_DRY_RUN') ?? true;
    const user = this.config.get<string>('SMTP_USER');

    // No credentials is the same as dry run rather than a crash on boot:
    // every other feature must keep working without email configured.
    this.transporter =
      this.dryRun || !user
        ? null
        : nodemailer.createTransport({
            host: this.config.getOrThrow<string>('SMTP_HOST'),
            port: this.config.getOrThrow<number>('SMTP_PORT'),
            secure: this.config.get<boolean>('SMTP_SECURE') ?? false,
            auth: { user, pass: this.config.getOrThrow<string>('SMTP_PASS') },
            /**
             * IPv4 only.
             *
             * smtp.gmail.com publishes A and AAAA records. On a host with
             * no IPv6 route the connection fails with EHOSTUNREACH, and
             * Node's Happy Eyeballs races both families, so it fails
             * intermittently rather than always — which is worse, because
             * nobody investigates a mail server that works most of the time.
             *
             * `family` is a valid SMTP transport option but is not in the
             * published types, hence the assertion.
             */
            family: 4,
            // `family` is a real SMTP option but is absent from the
            // published types. Casting the whole object to
            // TransportOptions instead would select nodemailer's
            // custom-transport path and ignore host and port entirely.
          } as Parameters<typeof nodemailer.createTransport>[0]);

    if (!this.transporter) {
      this.logger.warn(
        this.dryRun
          ? 'MAIL_DRY_RUN is on — email is logged, not sent'
          : 'SMTP_USER is not set — email is logged, not sent',
      );
    }
  }

  get enabled() {
    return this.transporter !== null;
  }

  /** Never throws. The caller's work succeeded whether or not this did. */
  async send(mail: Mail): Promise<boolean> {
    const from = this.config.getOrThrow<string>('MAIL_FROM');

    if (!this.transporter) {
      this.logger.log(`[dry run] to ${mail.to}: ${mail.subject}`);
      await this.record(mail, 'SENT', 'Dry run — not actually sent');
      return true;
    }

    try {
      await this.transporter.sendMail({
        from,
        to: mail.to,
        subject: mail.subject,
        text: mail.body + (mail.action ? `\n\n${mail.action.label}: ${mail.action.url}` : ''),
        html: this.html(mail),
      });
      await this.record(mail, 'SENT');
      this.logger.log(`Sent "${mail.subject}" to ${mail.to}`);
      return true;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Failed to email ${mail.to}: ${reason}`);
      await this.record(mail, 'FAILED', reason);
      return false;
    }
  }

  private async record(mail: Mail, status: 'SENT' | 'FAILED', error?: string) {
    await this.prisma.emailLog
      .create({
        data: {
          toEmail: mail.to,
          subject: mail.subject,
          body: mail.body,
          status,
          error: error?.slice(0, 500),
        },
      })
      // The log is evidence, not the point. Losing it must not lose the mail.
      .catch(() => undefined);
  }

  /** Deliberately plain: inline styles only, no images, no external CSS. */
  private html(mail: Mail): string {
    const paragraphs = mail.body
      .trim()
      .split(/\n{2,}/)
      .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(p)}</p>`)
      .join('');

    const button = mail.action
      ? `<p style="margin:24px 0"><a href="${escapeHtml(mail.action.url)}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">${escapeHtml(mail.action.label)}</a></p>`
      : '';

    return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#1f2937;max-width:560px">
${paragraphs}${button}
</div>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
