import type { ReactNode } from "react";

function inlineFormat(text: string): ReactNode {
  // **bold** and `code` only
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return <strong key={i} className="font-semibold text-zinc-800">{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`"))
      return <code key={i} className="px-1 py-0.5 bg-zinc-100 text-zinc-700 rounded text-[0.8em] font-mono">{p.slice(1, -1)}</code>;
    return p;
  });
}

export function MarkdownView({ content, className = "" }: { content: string; className?: string }) {
  const lines = content.split("\n");
  const nodes: ReactNode[] = [];
  let inCodeBlock = false;
  let codeLang = "";
  let codeLines: string[] = [];
  let listItems: string[] = [];
  let listDepth = 0;
  let tableLines: string[] = [];

  const flushList = () => {
    if (!listItems.length) return;
    nodes.push(
      <ul key={nodes.length} className="my-2 ml-5 space-y-0.5 list-disc">
        {listItems.map((item, i) => (
          <li key={i} className="text-sm text-zinc-700 leading-relaxed">{inlineFormat(item)}</li>
        ))}
      </ul>
    );
    listItems = [];
    listDepth = 0;
  };

  const flushTable = () => {
    if (!tableLines.length) return;
    const rows = tableLines.filter(l => !l.match(/^\|[-: |]+\|$/));
    nodes.push(
      <div key={nodes.length} className="my-3 overflow-x-auto">
        <table className="text-xs border-collapse w-full">
          <tbody>
            {rows.map((row, ri) => {
              const cells = row.split("|").slice(1, -1).map(c => c.trim());
              const Tag = ri === 0 ? "th" : "td";
              return (
                <tr key={ri} className={ri === 0 ? "bg-zinc-100" : ri % 2 === 0 ? "bg-zinc-50" : ""}>
                  {cells.map((cell, ci) => (
                    <Tag key={ci} className={`border border-zinc-200 px-2 py-1 text-left ${ri === 0 ? "font-semibold" : ""}`}>
                      {inlineFormat(cell)}
                    </Tag>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
    tableLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        nodes.push(
          <pre key={nodes.length} className="my-2 p-3 bg-zinc-50 border border-zinc-200 rounded-md text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">
            {codeLines.join("\n")}
          </pre>
        );
        codeLines = [];
        inCodeBlock = false;
        codeLang = "";
      } else {
        flushList();
        flushTable();
        codeLang = line.slice(3).trim();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (line.startsWith("|")) {
      flushList();
      tableLines.push(line);
      continue;
    } else {
      flushTable();
    }

    if (line.startsWith("# ")) {
      flushList();
      nodes.push(<h2 key={nodes.length} className="text-base font-bold text-zinc-900 mt-5 mb-2 first:mt-0 pb-1 border-b border-zinc-100">{line.slice(2)}</h2>);
    } else if (line.startsWith("## ")) {
      flushList();
      nodes.push(<h3 key={nodes.length} className="text-sm font-semibold text-zinc-800 mt-4 mb-1.5">{line.slice(3)}</h3>);
    } else if (line.startsWith("### ")) {
      flushList();
      nodes.push(<h4 key={nodes.length} className="text-xs font-semibold text-zinc-600 uppercase tracking-wide mt-3 mb-1">{line.slice(4)}</h4>);
    } else if (line.match(/^[-*] /)) {
      listItems.push(line.slice(2));
    } else if (line.match(/^  [-*] /)) {
      listItems.push(line.slice(4));
    } else if (line.startsWith("> ")) {
      flushList();
      nodes.push(
        <blockquote key={nodes.length} className="pl-3 border-l-3 border-zinc-300 text-sm text-zinc-500 italic my-1.5">
          {inlineFormat(line.slice(2))}
        </blockquote>
      );
    } else if (line.trim() === "" || line.trim() === "---") {
      flushList();
      if (line.trim() === "---") {
        nodes.push(<hr key={nodes.length} className="my-3 border-zinc-100" />);
      }
    } else if (line.trim()) {
      flushList();
      nodes.push(
        <p key={nodes.length} className="text-sm text-zinc-700 leading-relaxed my-1">
          {inlineFormat(line)}
        </p>
      );
    }
  }

  flushList();
  flushTable();

  return <div className={`markdown ${className}`}>{nodes}</div>;
}
