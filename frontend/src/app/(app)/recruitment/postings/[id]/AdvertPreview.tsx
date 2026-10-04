'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Megaphone, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import type { Advert } from '@/store/api/endpoints/recruitmentApi';

/** Past this, most feeds hide the rest behind a "see more". */
const FOLD = 210;

/**
 * The advert, generated from the posting and ready to paste.
 *
 * Shown rather than stored, so editing the skills changes the advert in
 * the same breath. The fold marker is the point of the preview: the first
 * two lines are what most people ever read, and HR should be able to see
 * where that line falls before publishing.
 */
export function AdvertPreview({ advert, code }: { advert: Advert; code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(advert.text);
      setCopied(true);
      toast.success('Advert copied — paste it wherever you are posting');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not reach the clipboard. Select the text and copy it.');
    }
  }

  const above = advert.text.slice(0, FOLD);
  const below = advert.text.slice(FOLD);

  return (
    <section className="mb-5 rounded-xl border border-line-subtle bg-surface-raised p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-h3 text-content-primary">
            <Megaphone size={17} strokeWidth={2} className="text-[var(--color-primary)]" aria-hidden />
            Advert
          </h2>
          <p className="mt-0.5 text-body-sm text-content-secondary">
            Built from this posting, so it can never disagree with what you
            screen against.
          </p>
        </div>
        <Button
          variant={copied ? 'secondary' : 'primary'}
          icon={copied ? Check : Copy}
          onClick={copy}
        >
          {copied ? 'Copied' : 'Copy advert'}
        </Button>
      </div>

      <div className="mt-4 rounded-lg border border-line-subtle bg-surface-sunken p-4">
        <pre className="whitespace-pre-wrap break-words font-sans text-body leading-relaxed text-content-primary">
          {above}
          {below && (
            <>
              <span className="mx-1 select-none rounded bg-[color-mix(in_srgb,var(--warning)_18%,transparent)] px-1.5 py-0.5 text-caption font-semibold text-warning">
                …see more
              </span>
              <span className="text-content-tertiary">{below}</span>
            </>
          )}
        </pre>
      </div>

      <p className="mt-2.5 flex items-start gap-1.5 text-caption text-content-tertiary">
        <TriangleAlert size={12} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Everything after the marker is hidden until somebody clicks. The{' '}
          <span className="tabular font-medium text-content-secondary">{code}</span>{' '}
          code near the end is what files an emailed CV against this role —
          keep it in, wherever you move the text.
        </span>
      </p>

      <p className="mt-1 text-caption text-content-tertiary">
        <span className={cn('tabular', advert.characters > 3000 && 'text-warning')}>
          {advert.characters}
        </span>{' '}
        characters · most feeds allow 3,000
      </p>
    </section>
  );
}
