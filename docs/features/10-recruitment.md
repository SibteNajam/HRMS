# Feature 10 — Recruitment

**Depends on:** Employees, Notifications.
**Contains AI:** yes — reads CVs and scores them against a job description.
**Status: OPTIONAL. Build last.**

## Scope warning — read before starting

Recruitment appears in the **presentation** but **not** in the R&D report's
module list. It is the largest piece of extra work in the project.

Build it only if features 1–9 are finished and tested. If time runs short, drop
it and state that in your final report as a scope decision. Do not weaken
payroll or leave to make room for it — those are in the report and this is not.

The original description ("get resume/CV via emails, extract PDF, match skills
with job description, email the candidate as follow up, and later schedule
interviews") contains four subsystems. This document reduces it to the two that
demonstrate the idea, and marks the rest optional.

| Part | Effort | Verdict |
|---|---|---|
| Manual CV upload | Low | **Build this** |
| AI matching against a JD | Low — the model does the work | **Build this** |
| AI-drafted follow-up email | Low — reuses the mail module | **Build this** |
| Interview scheduling | Medium | Build if time allows |
| Automatic inbox polling | High | **Skip.** See below |

### Why skip inbox polling

Reading a mailbox means IMAP, OAuth or app passwords, connection management,
"which messages have I already processed" state, attachment extraction, MIME
edge cases, and a permanently-running poller. It is days of work, it is
fragile, and it demonstrates nothing about AI.

Manual upload demonstrates exactly the same AI capability. Put "automated
mailbox intake" in Future Enhancements.

## Roles

HR and ADMIN only. Employees have no access to this module and it does not
appear in their sidebar.

## Data

`job_postings`, `candidates`, `interviews` — see
[Database Schema](../03-database-schema.md#recruitment-optional-module).

## Endpoints

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/recruitment/postings` | HR, ADMIN | JD pasted as text |
| GET | `/recruitment/postings` | HR, ADMIN | |
| PATCH | `/recruitment/postings/:id/close` | HR, ADMIN | |
| POST | `/recruitment/postings/:id/candidates` | HR, ADMIN | Upload one or more CV PDFs |
| GET | `/recruitment/postings/:id/candidates` | HR, ADMIN | Ranked by score |
| GET | `/recruitment/candidates/:id` | HR, ADMIN | Match detail |
| PATCH | `/recruitment/candidates/:id/status` | HR, ADMIN | Human decision. Audited |
| POST | `/recruitment/candidates/:id/email-draft` | HR, ADMIN | AI drafts. Does not send |
| POST | `/recruitment/candidates/:id/interviews` | HR, ADMIN | Schedule |
| PATCH | `/recruitment/interviews/:id` | HR, ADMIN | Reschedule or cancel |

## AI involvement

This is the most visually impressive AI feature in the project. It is also the
simplest to implement, because the model does the hard part.

### CV matching

**Send the PDF to the model directly.** Do not extract text first.

```ts
const CvMatchSchema = z.object({
  candidateName:  z.string(),
  candidateEmail: z.string(),
  candidatePhone: z.string().nullable(),
  yearsExperience: z.number().nullable(),
  matchScore:     z.number().min(0).max(100),
  matchedSkills:  z.array(z.string()),
  missingSkills:  z.array(z.string()),
  summary:        z.string(),
});

const response = await this.ai.client.messages.parse({
  model: this.ai.model,
  max_tokens: 2048,
  messages: [{
    role: 'user',
    content: [
      { type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
      { type: 'text', text:
        `Job description:\n${posting.description}\n\n` +
        `Extract the candidate's details from this CV and score their fit ` +
        `against the job description from 0 to 100. List which required ` +
        `skills they have and which they are missing. Base the score only on ` +
        `evidence in the CV.` },
    ],
  }],
  output_config: { format: zodOutputFormat(CvMatchSchema) },
});

const match = response.parsed_output;
if (!match) throw new BadRequestException('Could not read this CV.');
```

Two things worth noting for your report:

1. **No PDF parsing library is used.** The model reads the document natively.
2. **This is better than text extraction**, not merely easier. A two-column CV
   or one with a skills sidebar comes out scrambled through `pdf-parse`; the
   model sees the layout.

The Zod schema means the response is validated JSON, so a malformed answer
throws instead of silently writing nonsense into the database.

### What the AI does not do

**It does not shortlist, reject or hire.** `match_score` is advice. Status
changes are a human clicking a button, audited like every other decision.

Say this explicitly in your report. Automated candidate rejection is the most
common real-world harm from AI in HR, and deliberately not doing it is a point
in your favour, not a missing feature.

### Follow-up drafts

The same draft/send split as [Notifications](09-notifications-email.md):

| Purpose | Drafted content |
|---|---|
| `acknowledgement` | We received your application |
| `interview_invite` | Proposed date, time and mode |
| `rejection` | Polite, no reason given |

HR reviews and presses Send. The AI never sends.

## Business rules

1. **PDF only**, 5 MB maximum. Reject anything else at upload with a clear
   message.
2. **Duplicate detection** on `(job_posting_id, email)` — re-uploading the same
   CV updates the existing candidate rather than creating a second.
3. **Match scores are advisory.** Never auto-reject on a low score.
4. **Status transitions are one-way**:
   `NEW → SHORTLISTED → INTERVIEW_SCHEDULED → HIRED`, with `REJECTED` reachable
   from any state. Going backwards is not allowed.
5. **Scheduling an interview** sets the candidate to `INTERVIEW_SCHEDULED` and
   queues a draft invitation for HR to review.
6. **Interviews cannot be scheduled in the past.**
7. **Closing a posting** stops new uploads; existing candidates remain.
8. **CVs are stored on disk** under `uploads/cvs/`, path recorded in
   `resume_path`. Not in the database — MySQL is not a file store.
9. **Hiring does not create an employee.** HR creates the employee record
   through the normal flow. Linking the two is out of scope and would need a
   data-transfer step that adds nothing to the demonstration.

## Frontend

### Screens

| Screen | Route |
|---|---|
| Job postings | `/recruitment` |
| Posting detail + candidates | `/recruitment/postings/:id` |
| Candidate detail | `/recruitment/candidates/:id` |
| Interview calendar | `/recruitment/interviews` |

### Posting detail

The main screen. A drop zone for CV upload at the top, then candidates ranked by
`match_score` descending.

Each candidate row: name, email, score as a coloured badge (green ≥ 70, amber
40–69, red < 40), matched skill count, status, and actions.

Upload shows per-file progress. Scoring a CV takes a few seconds, so process
them one at a time with a visible queue rather than freezing on a bulk upload.

### Candidate detail

Two columns. Left: the match analysis — score, matched skills as green chips,
missing skills as grey chips, the AI summary, clearly marked as AI-generated.
Right: the CV in an embedded PDF viewer, so HR can check the AI's reading
against the actual document.

That side-by-side is the point. It keeps the human in the loop by making
verification effortless.

Below: status buttons and an email draft composer.

### RTK Query

```ts
getPostings:   providesTags: [{ type: 'JobPosting', id: 'LIST' }]
getCandidates: providesTags: (r, e, postingId) => [
                 { type: 'Candidate', id: `POSTING_${postingId}` }]

uploadCv:      invalidatesTags: (r, e, { postingId }) => [
                 { type: 'Candidate', id: `POSTING_${postingId}` }]
updateStatus:  invalidatesTags: (r, e, { id, postingId }) => [
                 { type: 'Candidate', id },
                 { type: 'Candidate', id: `POSTING_${postingId}` }]
```

## Manual setup

🔴 Create the upload directory and add it to `.gitignore`:

```bash
mkdir -p backend/uploads/cvs
echo "uploads/" >> backend/.gitignore
```

CVs contain personal data. They must never be committed.

🔴 Set the upload limit in `.env`:

```bash
MAX_CV_SIZE_MB=5
```

## Cost

CV matching is the most expensive AI call in the project — a PDF is many more
input tokens than a chat question. Roughly **$0.05–0.10 per CV** on
`claude-opus-5`.

Twenty CVs across development and the demo is about $2. Still within the $5–10
budget, but do not loop over a folder of a hundred test CVs.

## Done when

- [ ] A posting can be created with a pasted JD
- [ ] A CV PDF uploads and is scored within a few seconds
- [ ] Name and email are extracted correctly from the CV
- [ ] The score is plausible against the JD
- [ ] Matched and missing skills reflect the CV's actual content
- [ ] Candidates are ranked by score
- [ ] Re-uploading the same CV updates rather than duplicates
- [ ] A non-PDF is rejected with a clear message
- [ ] An oversized file is rejected
- [ ] Status changes require a human click and are audited
- [ ] No code path auto-rejects on a low score
- [ ] The email draft appears editable and is not sent automatically
- [ ] An interview can be scheduled and cannot be set in the past
- [ ] CVs are on disk, not in the database, and not in git
