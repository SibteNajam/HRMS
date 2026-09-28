import { cn } from '@/lib/cn';

/**
 * A deliberately small markdown renderer.
 *
 * The model is instructed to use tables and bold, and nothing else. Pulling
 * in a full markdown library plus a sanitiser to render three constructs
 * from an LLM is a large attack surface for very little.
 *
 * Nothing here uses dangerouslySetInnerHTML — every node is a React element,
 * so model output can never become markup.
 */
export function Markdown({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) => {
        const lines = block.split('\n');

        // Table: | a | b |  /  |---|---|  /  rows
        if (lines.length >= 2 && /^\s*\|/.test(lines[0]) && /^[\s|:-]+$/.test(lines[1])) {
          const cells = (row: string) =>
            row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
          const head = cells(lines[0]);
          const body = lines.slice(2).filter((l) => l.trim()).map(cells);

          return (
            <div key={i} className="overflow-x-auto rounded-lg border border-line-subtle">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-sunken">
                    {head.map((h, j) => (
                      <th key={j} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-content-secondary">
                        <Inline text={h} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((row, r) => (
                    <tr key={r} className="border-t border-line-subtle">
                      {row.map((c, j) => (
                        <td key={j} className="tabular px-3 py-2 text-body-sm text-content-primary">
                          <Inline text={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        // Bullet or numbered list
        if (lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l))) {
          const ordered = /^\s*\d+\./.test(lines[0]);
          const Tag = ordered ? 'ol' : 'ul';
          return (
            <Tag
              key={i}
              className={cn(
                'flex flex-col gap-1 pl-5 text-body leading-relaxed',
                ordered ? 'list-decimal' : 'list-disc',
              )}
            >
              {lines.map((l, j) => (
                <li key={j}>
                  <Inline text={l.replace(/^\s*([-*]|\d+\.)\s+/, '')} />
                </li>
              ))}
            </Tag>
          );
        }

        return (
          <p key={i} className="text-body leading-relaxed">
            {lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                <Inline text={l} />
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** **bold** and `code`. Everything else stays literal text. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold text-content-primary">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} className="rounded bg-surface-sunken px-1 py-0.5 text-[0.9em]">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
