import type { ReactNode } from 'react';

// Minimal renderer for the markdown myScheme and the AI return: headings,
// bold, links and bullet/numbered lists. Builds React elements, so no HTML
// from the source is ever injected into the page.

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*([^*\s][^*]*?)\*|`([^`]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1]) {
      nodes.push(<strong key={`${keyPrefix}-b${index}`} className="font-semibold text-on-surface">{match[1]}</strong>);
    } else if (match[4]) {
      nodes.push(<em key={`${keyPrefix}-i${index}`}>{match[4]}</em>);
    } else if (match[5]) {
      nodes.push(
        <code key={`${keyPrefix}-c${index}`} className="rounded bg-surface-container-high px-1 py-0.5 font-mono text-[0.9em] text-on-surface">
          {match[5]}
        </code>,
      );
    } else {
      nodes.push(
        <a
          key={`${keyPrefix}-a${index}`}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary font-semibold hover:underline break-words"
        >
          {match[2].trim()}
        </a>,
      );
    }
    last = pattern.lastIndex;
    index += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let table: string[][] | null = null;

  const flushTable = () => {
    if (!table) return;
    const key = `table-${blocks.length}`;
    const [head, ...body] = table;
    blocks.push(
      <div key={key} className="overflow-x-auto rounded-xl border border-outline-variant/30">
        <table className="w-full text-xs">
          <thead className="bg-surface-container-high text-on-surface">
            <tr>{head.map((cell, i) => <th key={i} className="px-3 py-2 text-left font-bold">{renderInline(cell, `${key}-h${i}`)}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((row, r) => (
              <tr key={r} className="border-t border-outline-variant/20">
                {row.map((cell, c) => <td key={c} className="px-3 py-2 align-top">{renderInline(cell, `${key}-${r}-${c}`)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    table = null;
  };

  const flushList = () => {
    if (!list) return;
    const key = `list-${blocks.length}`;
    const items = list.items.map((item, i) => <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={key} className="list-decimal pl-5 space-y-1">{items}</ol>
      ) : (
        <ul key={key} className="list-disc pl-5 space-y-1">{items}</ul>
      ),
    );
    list = null;
  };

  let fence: string[] | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    // ``` fenced blocks: keep the lines verbatim; the language tag is not shown as text.
    if (/^```/.test(line)) {
      if (fence) {
        const key = `code-${blocks.length}`;
        blocks.push(
          <pre key={key} className="overflow-x-auto rounded-xl bg-surface-container-high p-3 text-xs leading-relaxed">
            <code className="font-mono text-on-surface">{fence.join('\n')}</code>
          </pre>,
        );
        fence = null;
      } else {
        flushList();
        flushTable();
        fence = [];
      }
      continue;
    }
    if (fence) {
      fence.push(rawLine);
      continue;
    }
    if (/^\|.*\|$/.test(line)) {
      flushList();
      const cells = line.slice(1, -1).split('|').map((cell) => cell.trim());
      // Skip markdown separator rows like | --- | --- |
      if (!cells.every((cell) => /^:?-{2,}:?$/.test(cell))) (table ??= []).push(cells);
      continue;
    }
    flushTable();
    if (!line || /^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushList();
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet || numbered)![1]);
      continue;
    }
    flushList();
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    const key = `p-${blocks.length}`;
    if (heading) {
      blocks.push(<p key={key} className="font-headline font-bold text-on-surface pt-1">{renderInline(heading[1], key)}</p>);
    } else {
      blocks.push(<p key={key}>{renderInline(line, key)}</p>);
    }
  }
  flushList();
  flushTable();
  if (fence) {
    blocks.push(
      <pre key={`code-${blocks.length}`} className="overflow-x-auto rounded-xl bg-surface-container-high p-3 text-xs leading-relaxed">
        <code className="font-mono text-on-surface">{fence.join('\n')}</code>
      </pre>,
    );
  }

  return <div className={className ?? 'space-y-2 text-sm text-on-surface-variant leading-relaxed'}>{blocks}</div>;
}
