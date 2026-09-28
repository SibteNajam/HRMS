'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Check, Copy, Plus, SendHorizontal, Sparkles, Trash2, TriangleAlert,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { ThinkingDots } from '@/components/ui/loading';
import { formatRelative } from '@/lib/format';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { useAppSelector } from '@/store/hooks';
import {
  TOOL_LABELS,
  useDeleteConversationMutation,
  useGetAiStatusQuery,
  useGetConversationQuery,
  useGetConversationsQuery,
  useSendChatMutation,
} from '@/store/api/endpoints/aiApi';
import { Markdown } from './Markdown';

const SUGGESTIONS = {
  EMPLOYEE: [
    'How many leave days do I have left?',
    'Show my attendance this month',
    'Do I have any outstanding dues?',
    'Why was my last payslip different?',
  ],
  HR: [
    'Who has attendance below 90% this month?',
    'How many leave requests are waiting for me?',
    'Which employees have outstanding dues?',
    'Summarise this month’s attendance problems',
  ],
};

export default function AssistantPage() {
  const me = useAppSelector((s) => s.auth.user)!;
  const suggestions = me.role === 'EMPLOYEE' ? SUGGESTIONS.EMPLOYEE : SUGGESTIONS.HR;

  const [conversationId, setConversationId] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: status } = useGetAiStatusQuery();
  const { data: conversations } = useGetConversationsQuery();
  const { data: conversation } = useGetConversationQuery(conversationId!, {
    skip: !conversationId,
  });
  const [send, { isLoading }] = useSendChatMutation();
  const [remove] = useDeleteConversationMutation();

  const messages = conversation?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, pending]);

  async function submit(text: string) {
    const question = text.trim();
    if (!question || isLoading) return;
    setInput('');
    setPending(question);
    try {
      const res = await send({
        message: question,
        conversationId: conversationId ?? undefined,
      }).unwrap();
      setConversationId(res.conversationId);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPending(null);
    }
  }

  if (status && !status.enabled) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-[420px] rounded-xl border border-line-subtle bg-surface-raised p-8 text-center shadow-sm">
          <TriangleAlert size={40} strokeWidth={1.25} className="mx-auto text-warning" aria-hidden />
          <h2 className="mt-4 font-display text-h3 text-content-primary">
            Assistant not configured
          </h2>
          <p className="mt-1.5 text-body-sm text-content-secondary">
            An administrator needs to set <code className="rounded bg-surface-sunken px-1">GROQ_API_KEY</code>.
            Every other part of Cadre works without it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-5">
      {/* History rail */}
      <aside className="hidden w-[260px] shrink-0 flex-col lg:flex">
        <Button
          variant="secondary" icon={Plus} fullWidth
          onClick={() => { setConversationId(null); setInput(''); }}
        >
          New conversation
        </Button>
        <div className="mt-3 flex-1 overflow-y-auto">
          {conversations?.map((c) => (
            <div
              key={c.id}
              className={cn(
                'group flex items-center gap-2 rounded-lg px-3 py-2 transition-colors',
                c.id === conversationId ? 'bg-surface-selected' : 'hover:bg-surface-hover',
              )}
            >
              <button
                type="button"
                onClick={() => setConversationId(c.id)}
                className="min-w-0 flex-1 text-left"
              >
                <p className={cn(
                  'truncate text-body-sm',
                  c.id === conversationId
                    ? 'font-medium text-content-selected'
                    : 'text-content-primary',
                )}>
                  {c.title}
                </p>
                <p className="text-caption text-content-tertiary">
                  {formatRelative(c.createdAt)}
                </p>
              </button>
              <button
                type="button"
                aria-label="Delete conversation"
                onClick={async () => {
                  await remove(c.id);
                  if (c.id === conversationId) setConversationId(null);
                }}
                className="opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Thread */}
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-line-subtle bg-surface-raised shadow-sm">
        <div className="flex-1 overflow-y-auto p-6">
          {messages.length === 0 && !pending ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-selected">
                <Sparkles size={26} strokeWidth={1.75} className="text-content-selected" />
              </span>
              <h2 className="mt-4 font-display text-h2 text-content-primary">
                Ask about your HR data
              </h2>
              <p className="mt-1.5 max-w-[440px] text-body-sm text-content-secondary">
                I can read {me.role === 'EMPLOYEE' ? 'your' : 'the organisation’s'} leave,
                attendance, payroll and dues. I cannot change anything.
              </p>
              {/* A blank box gets one bad question, then abandonment. */}
              <div className="mt-6 grid w-full max-w-[560px] gap-2 sm:grid-cols-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => submit(s)}
                    className="rounded-lg border border-line-default bg-surface-raised px-3.5 py-2.5 text-left text-body-sm text-content-primary transition-colors hover:border-[var(--color-primary)] hover:bg-surface-hover"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-[720px] flex-col gap-5">
              {messages.map((m) => (
                <Message key={m.id} role={m.role} content={m.content} tools={m.toolsUsed} />
              ))}
              {pending && <Message role="USER" content={pending} tools={null} />}
              {isLoading && (
                <div className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-selected">
                    <Sparkles size={15} className="text-content-selected" />
                  </span>
                  <div className="rounded-xl rounded-bl-sm bg-surface-sunken px-4 py-3">
                    <ThinkingDots label="Reading your data…" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-line-subtle p-4">
          <form
            onSubmit={(e) => { e.preventDefault(); submit(input); }}
            className="mx-auto flex max-w-[720px] items-end gap-2"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit(input);
                }
              }}
              rows={1}
              placeholder="Ask about leave, attendance, payroll or dues…"
              aria-label="Message"
              className="max-h-[140px] min-h-[44px] flex-1 resize-y rounded-lg border border-line-default bg-surface-raised px-3.5 py-3 text-body text-content-primary placeholder:text-content-tertiary focus:border-[var(--color-primary)] focus:outline-none"
            />
            <Button
              type="submit" variant="primary" size="icon"
              loading={isLoading} disabled={!input.trim()}
              aria-label="Send"
            >
              <SendHorizontal size={18} />
            </Button>
          </form>
          <p className="mx-auto mt-2 max-w-[720px] text-caption text-content-tertiary">
            AI-generated from your own records. Verify anything you act on.
          </p>
        </div>
      </div>
    </div>
  );
}

function Message({
  role, content, tools,
}: {
  role: 'USER' | 'ASSISTANT';
  content: string;
  tools: string[] | null;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = role === 'USER';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-xl rounded-br-sm bg-[var(--color-primary-solid)] px-4 py-2.5">
          <p className="text-body leading-relaxed text-white">{content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-selected">
        <Sparkles size={15} className="text-content-selected" />
      </span>
      <div className="min-w-0 flex-1">
        {/* Which records were read to produce this — the audit trail, shown. */}
        {!!tools?.length && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {[...new Set(tools)].map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 text-caption text-content-tertiary"
              >
                <Check size={11} strokeWidth={2.5} className="text-success" />
                {TOOL_LABELS[t] ?? t}
              </span>
            ))}
          </div>
        )}
        <div className="rounded-xl rounded-bl-sm bg-surface-sunken px-4 py-3 text-content-primary">
          <Markdown text={content} />
        </div>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(content);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="mt-1.5 inline-flex items-center gap-1 text-caption text-content-tertiary transition-colors hover:text-content-primary"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
