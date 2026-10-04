import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ImapFlow } from 'imapflow';
import { simpleParser, type Attachment } from 'mailparser';
import { formatOf } from './cv-parser.js';
import { RecruitmentService } from './recruitment.service.js';

/**
 * Watches a mailbox for CVs.
 *
 * The careers page is the better route — it knows which job it belongs to
 * and collects details a PDF makes us guess at. This is the fallback for
 * people who email anyway, which plenty do.
 *
 * Off unless IMAP_USER is set. A checkout without credentials runs the rest
 * of the system normally rather than failing on boot.
 */
@Injectable()
export class CvInboxService {
  private readonly logger = new Logger(CvInboxService.name);
  private readonly host: string;
  private readonly user: string | undefined;
  private readonly pass: string | undefined;
  /** Guards against a slow poll overlapping the next tick. */
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly recruitment: RecruitmentService,
  ) {
    this.host = this.config.get<string>('IMAP_HOST') ?? 'imap.gmail.com';
    this.user = this.config.get<string>('IMAP_USER') || undefined;
    this.pass = this.config.get<string>('IMAP_PASS') || undefined;

    if (!this.user) {
      this.logger.warn('IMAP_USER is not set — CVs by email are not being collected');
    }
  }

  get enabled() {
    return Boolean(this.user && this.pass);
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async poll() {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      await this.collect();
    } catch (err) {
      // A mailbox that is down must not take the application down with it.
      this.logger.error('Could not read the CV inbox', err as Error);
    } finally {
      this.running = false;
    }
  }

  /** Exposed so HR can pull now rather than waiting for the next tick. */
  async collect(): Promise<{ read: number; applications: number; ignored: number }> {
    const client = new ImapFlow({
      host: this.host,
      port: this.config.get<number>('IMAP_PORT') ?? 993,
      secure: true,
      auth: { user: this.user!, pass: this.pass! },
      logger: false,
      // Fail in a minute rather than hanging a background job for as long
      // as the OS default allows.
      socketTimeout: 60_000,
      greetingTimeout: 20_000,
      connectionTimeout: 20_000,
    });

    // ImapFlow emits socket failures as an 'error' event. Without a
    // listener Node treats that as unhandled and kills the process — a
    // mailbox that times out took the entire API down with it once.
    client.on('error', (err: Error) => {
      this.logger.error(`CV inbox connection failed: ${err.message}`);
    });

    await client.connect();
    let read = 0;
    let applications = 0;
    let ignored = 0;

    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        // Unseen only. Marking them seen as we go is what stops the same CV
        // becoming an application every five minutes.
        const unseen = await client.search({ seen: false });
        if (!unseen || unseen.length === 0) return { read, applications, ignored };

        for (const uid of unseen.slice(0, 50)) {
          const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!message || !message.source) continue;
          read += 1;

          const mail = await simpleParser(message.source);
          const cvs = (mail.attachments ?? []).filter(isCv);

          if (cvs.length === 0) {
            // Not every message to careers@ is an application. Leave it
            // unread so a person sees it in the mailbox.
            ignored += 1;
            this.logger.log(`No CV attached to "${mail.subject ?? '(no subject)'}" — left unread`);
            continue;
          }

          const from = mail.from?.value?.[0];
          for (const attachment of cvs) {
            await this.recruitment.receive({
              file: attachment.content,
              fileName: attachment.filename ?? 'cv.pdf',
              mimeType: attachment.contentType,
              fromName: from?.name,
              fromEmail: from?.address,
              // Read for a job code. Empty string rather than undefined so
              // the pipeline records this as an EMAIL application either way.
              subject: mail.subject ?? '',
            });
            applications += 1;
          }

          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }

    if (applications > 0) {
      this.logger.log(
        `CV inbox: ${read} message(s) read, ${applications} application(s) created, ${ignored} ignored`,
      );
    }
    return { read, applications, ignored };
  }
}

/**
 * Whether an attachment is plausibly a CV.
 *
 * Mail clients attach signature images and inline logos to everything, and
 * a 2 KB PNG is not somebody's career history.
 */
function isCv(attachment: Attachment): boolean {
  const name = attachment.filename ?? '';
  if (!name) return false;
  if (!formatOf(name, attachment.contentType)) return false;
  return attachment.size > 1_000 && attachment.size < 10 * 1024 * 1024;
}
