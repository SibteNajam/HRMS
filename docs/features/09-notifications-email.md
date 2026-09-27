# Feature 09 — Notifications & Email

**Depends on:** Auth. Used by every other module.
**Contains AI:** yes — drafts email bodies. Never sends.

## Purpose

Tell people things happened. Two channels: an in-app bell for everything, and
email for things that matter when the person is not logged in.

## Roles

Everyone receives notifications. Only HR and ADMIN can trigger a manual email.

## Data

`notifications`, `email_log` — see
[Database Schema](../03-database-schema.md#communication).

`email_log` stores every outbound message including failures. It is how you
debug SMTP, and it is evidence for your report that the feature works.

## Endpoints

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/notifications` | any | Own only, paginated |
| GET | `/notifications/unread-count` | any | For the bell badge |
| PATCH | `/notifications/:id/read` | owner | |
| PATCH | `/notifications/read-all` | any | |
| POST | `/emails/draft` | HR, ADMIN | AI generates a body. **Does not send** |
| POST | `/emails/send` | HR, ADMIN | Sends. Logged |
| GET | `/emails/log` | ADMIN | |

Note that drafting and sending are two endpoints. The AI can reach the first.
Only a human pressing a button reaches the second.

## Notification triggers

| Event | Recipient | Channel |
|---|---|---|
| Leave request submitted | HR | In-app |
| Leave approved or rejected | Employee | In-app + email |
| Payslip issued | Employee | In-app + email |
| Due created | Employee | In-app + email |
| Due cleared | Employee | In-app |
| Attendance anomaly flagged | HR | In-app |
| Account created | Employee | Email (contains the password) |
| Password changed | Employee | Email |

In-app for everything. Email only where the person needs to know while away
from the app. Emailing every event trains people to ignore your emails.

## Email implementation

```ts
// modules/notifications/mail.service.ts
@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly dryRun: boolean;

  constructor(private readonly config: ConfigService,
              private readonly prisma: PrismaService) {
    this.dryRun = config.get<boolean>('MAIL_DRY_RUN');
    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow('SMTP_HOST'),
      port: config.getOrThrow<number>('SMTP_PORT'),
      secure: config.get<boolean>('SMTP_SECURE'),
      auth: {
        user: config.getOrThrow('SMTP_USER'),
        pass: config.getOrThrow('SMTP_PASS'),
      },
    });
  }

  async send(to: string, subject: string, html: string) {
    if (this.dryRun) {
      this.logger.log(`[DRY RUN] → ${to}: ${subject}`);
      return this.log(to, subject, html, 'SENT', null);
    }
    try {
      await this.transporter.sendMail({
        from: this.config.get('MAIL_FROM'), to, subject, html,
      });
      await this.log(to, subject, html, 'SENT', null);
    } catch (err) {
      await this.log(to, subject, html, 'FAILED', err.message);
      this.logger.error(`Email to ${to} failed: ${err.message}`);
      // Swallowed deliberately — see below
    }
  }
}
```

### Email failure must never fail the operation

If SMTP is down when leave is approved, the approval still succeeds. The
employee is notified in-app and the failure is in `email_log`.

Send **after** the transaction commits, never inside it. An email cannot be
rolled back — if the transaction later fails, you have told someone their leave
was approved when it was not.

```ts
const result = await this.prisma.$transaction(async (tx) => { ... });
this.mail.send(...).catch(() => {});   // fire and forget, already logged
return result;
```

## Templates

Plain HTML in `notifications/templates/`, one per event, with a shared layout.
Keep them simple — no framework, no build step, and inline CSS because email
clients ignore `<style>` blocks.

| Template | Used for |
|---|---|
| `leave-approved.html` | Leave approved |
| `leave-rejected.html` | Leave rejected, includes the note |
| `payslip-issued.html` | Payroll finalised |
| `due-created.html` | New loan or advance |
| `account-created.html` | Welcome, contains the password |
| `custom.html` | Wrapper for AI-drafted bodies |

## AI involvement

**Drafts only. Never sends.**

```
POST /emails/draft
{ "purpose": "attendance_warning", "employeeId": 12, "tone": "firm" }
```

The service fetches the employee's real figures, gives them to the model, and
gets back a subject and body. HR sees it in an editable box, changes what they
want, and presses Send — which calls the separate `/emails/send` endpoint.

```
Subject: Attendance — September 2025

Dear Ahmed,

Your attendance for September was 71%, below the company standard of 80%.
Records show 6 absences and 5 late arrivals during the month.

Please meet with HR this week to discuss. If there are circumstances we should
be aware of, we would like to hear them.

Regards,
HR Department
```

Draft purposes: `attendance_warning`, `dues_reminder`, `leave_decision`,
`general`.

### Why the split matters

This is the clearest illustration of human-in-the-loop in the whole project, and
it is easy to demonstrate: show the draft appearing, edit a sentence, then send.
An AI that could send email autonomously would be one prompt injection away from
mailing every employee. An AI that fills a textarea is not.

## Frontend

### Notification bell

Topbar. Unread count badge. Click opens a dropdown of the 10 most recent —
title, body, relative time, unread dot. Clicking one marks it read and navigates
to its `link`.

```ts
useGetUnreadCountQuery(undefined, {
  pollingInterval: 30000,
  skipPollingIfUnfocused: true,
});
```

Polling is required — notifications are created by *other* users' actions, so
tag invalidation in this tab will never fire. See
[Realtime & Cache Invalidation](../08-realtime-and-cache-invalidation.md).

### Email composer

HR only. Pick a recipient, pick a purpose, press **Generate draft**. The subject
and body fill in, both editable. **Send** is a separate button and is disabled
while the body is empty.

The generated content is visually marked as AI-drafted, so HR knows to read it
before sending.

### RTK Query

```ts
getNotifications: providesTags: [{ type: 'Notification', id: 'LIST' }]
getUnreadCount:   providesTags: [{ type: 'Notification', id: 'COUNT' }]

markRead:    invalidatesTags: [{ type: 'Notification', id: 'LIST' },
                               { type: 'Notification', id: 'COUNT' }]
markAllRead: invalidatesTags: [{ type: 'Notification', id: 'LIST' },
                               { type: 'Notification', id: 'COUNT' }]
```

Marking read is the one place in this project where an optimistic update is
appropriate — a wrong guess costs nothing.

## Manual setup

🔴 **Gmail App Password.** This is the step that blocks people. Full
instructions in
[Setup Checklist](../04-setup-checklist.md#3--gmail-smtp--outbound-email).

Summary: enable 2-Step Verification on the Google account, then generate a
16-character App Password, then remove the spaces. Your normal Google password
will not work and returns `535 Username and Password not accepted`.

🔴 Use a **throwaway Gmail account**, not your personal one.

🔴 Keep `MAIL_DRY_RUN=true` during development. Set it to `false` only for the
demo. It will save you from mailing forty test messages to a real address.

Limit: 500 emails per day on a free Gmail account.

## Done when

- [ ] Approving leave creates a notification for the employee
- [ ] The bell badge increments within 30 s in the employee's browser
- [ ] Clicking a notification marks it read and navigates correctly
- [ ] With `MAIL_DRY_RUN=true`, emails are logged and not sent
- [ ] With it false, a real email arrives
- [ ] A wrong SMTP password produces a `FAILED` row, not a crash
- [ ] Approving leave still succeeds when SMTP is down
- [ ] Email is sent after the transaction commits, never inside it
- [ ] The AI draft appears in an editable box and is not sent automatically
- [ ] There is no code path where the AI reaches `/emails/send`
- [ ] Every email appears in `email_log`
