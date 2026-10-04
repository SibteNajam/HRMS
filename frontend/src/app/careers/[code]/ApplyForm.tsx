'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, Loader2, Paperclip, TriangleAlert, Upload } from 'lucide-react';
import { cn } from '@/lib/cn';
import { API, EXPERIENCE_OPTIONS } from '../types';

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = '.pdf,.docx,.txt';

/**
 * The form a candidate fills in.
 *
 * Everything on it exists to remove a guess. The role comes from the URL,
 * so nothing has to be inferred about which job this is. The name and
 * email are typed by the person they belong to rather than read out of a
 * PDF. And the experience is a list rather than a number box, because a
 * box makes somebody six months in round to nought or to one — both wrong,
 * and one of them reads as a lie on a form they are being judged by.
 */
export function ApplyForm({ code, title }: { code: string; title: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0] ?? null;
    if (chosen && chosen.size > MAX_BYTES) {
      setError('That file is over 8 MB. Send a smaller PDF.');
      e.target.value = '';
      return;
    }
    setError(null);
    setFile(chosen);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      setError('Attach your CV before sending.');
      return;
    }

    setSending(true);
    setError(null);
    try {
      const body = new FormData(e.currentTarget);
      body.set('cv', file);

      const res = await fetch(`${API}/careers/${code}/apply`, { method: 'POST', body });
      const payload = await res.json();

      if (!res.ok) {
        // The server's message is written for the candidate — an already
        // applied, a file it cannot read — so it is shown as written.
        setError(
          Array.isArray(payload.message) ? payload.message[0] : payload.message ?? 'Something went wrong.',
        );
        return;
      }
      setDone(payload.message);
    } catch {
      setError('Could not reach us just now. Please try again in a moment.');
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-[color-mix(in_srgb,var(--success)_32%,transparent)] bg-[color-mix(in_srgb,var(--success)_8%,transparent)] p-8 text-center">
        <CheckCircle2 size={40} strokeWidth={1.5} className="mx-auto text-success" aria-hidden />
        <h2 className="mt-4 font-display text-h2 text-content-primary">
          Application received
        </h2>
        <p className="mx-auto mt-2 max-w-[46ch] text-body text-content-secondary">{done}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-line-subtle bg-surface-raised p-6">
      <h2 className="font-display text-h2 text-content-primary">Apply for {title}</h2>
      <p className="mt-1 text-body-sm text-content-secondary">
        Takes a minute. Everything marked with an asterisk is required.
      </p>

      {error && (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3.5 py-3 text-body-sm text-danger"
        >
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <div className="mt-5 grid gap-x-4 sm:grid-cols-2">
        <Field label="Full name" name="fullName" required placeholder="Ayesha Siddiqui" />
        <Field label="Email" name="email" type="email" required placeholder="you@example.com" />
        <Field label="Phone" name="phone" placeholder="+92 300 1234567" />
        <Field label="City" name="address" placeholder="Lahore, Pakistan" />
      </div>

      <div className="mb-4">
        <label htmlFor="yearsExperience" className="mb-1.5 block text-body-sm font-medium text-content-primary">
          Relevant experience <span className="text-danger">*</span>
        </label>
        <select
          id="yearsExperience"
          name="yearsExperience"
          required
          defaultValue=""
          className="w-full rounded-lg border border-line-default bg-surface-raised px-3 py-2 text-body text-content-primary outline-none transition-colors focus:border-[var(--color-primary)]"
        >
          <option value="" disabled>Select…</option>
          {EXPERIENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <p className="mt-1 text-caption text-content-tertiary">
          Experience relevant to this role, not your total time working.
        </p>
      </div>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field
          label="Current salary" name="currentSalary" type="number" min={0}
          placeholder="150000" hint="PKR per month. Leave blank if you would rather not say."
        />
        <Field
          label="Expected salary" name="expectedSalary" type="number" min={0}
          placeholder="200000" hint="PKR per month"
        />
      </div>

      {/* The native file input is hidden rather than styled: browsers do
          not allow much styling of it, and the label is a real control. */}
      <label
        htmlFor="cv"
        className={cn(
          'mt-1 flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed px-4 py-5 transition-colors',
          file
            ? 'border-[color-mix(in_srgb,var(--success)_40%,transparent)] bg-[color-mix(in_srgb,var(--success)_6%,transparent)]'
            : 'border-line-default hover:border-[var(--color-primary)] hover:bg-surface-hover',
        )}
      >
        <input
          ref={fileInput}
          id="cv"
          name="cv"
          type="file"
          accept={ACCEPTED}
          required
          className="sr-only"
          onChange={pick}
        />
        {file ? (
          <Paperclip size={20} strokeWidth={2} className="shrink-0 text-success" aria-hidden />
        ) : (
          <Upload size={20} strokeWidth={2} className="shrink-0 text-content-tertiary" aria-hidden />
        )}
        <span className="min-w-0">
          <span className="block text-body font-medium text-content-primary">
            {file ? file.name : 'Attach your CV'}
          </span>
          <span className="block text-caption text-content-tertiary">
            {file
              ? `${(file.size / 1024).toFixed(0)} KB · click to change`
              : 'PDF, Word or plain text · up to 8 MB'}
          </span>
        </span>
      </label>

      <p className="mt-3 text-caption text-content-tertiary">
        A scanned CV cannot be read, so please send one with real text in it
        rather than a photograph.
      </p>

      <button
        type="submit"
        disabled={sending}
        className={cn(
          'mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary-solid)] px-4 py-3',
          'text-body font-semibold text-white transition-opacity hover:opacity-90',
          sending && 'pointer-events-none opacity-60',
        )}
      >
        {sending && <Loader2 size={16} className="animate-spin" />}
        {sending ? 'Sending…' : 'Send application'}
      </button>
    </form>
  );
}

function Field({
  label, name, type = 'text', required, placeholder, hint, min,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  min?: number;
}) {
  return (
    <div className="mb-4">
      <label htmlFor={name} className="mb-1.5 block text-body-sm font-medium text-content-primary">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        min={min}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border border-line-default bg-surface-raised px-3 py-2 text-body text-content-primary outline-none transition-colors focus:border-[var(--color-primary)]"
      />
      {hint && <p className="mt-1 text-caption text-content-tertiary">{hint}</p>}
    </div>
  );
}
