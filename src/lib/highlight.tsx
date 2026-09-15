import { Fragment, type ReactNode } from "react";

const TOKEN =
  /(\/\/.*$)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`[^`]*`)|\b(import|from|const|let|await|new|return|export|async|function|class|if|else|public|private)\b|\b(\d[\d_]*)\b/gm;

const CLASS_BY_GROUP = ["tok-com", "tok-str", "tok-kw", "tok-num"] as const;

/** Tokenise a TypeScript snippet into safe React spans (no innerHTML). */
export function highlight(code: string): ReactNode {
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of code.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(code.slice(cursor, index));

    const group = match.slice(1).findIndex((value) => value !== undefined);
    nodes.push(
      <span key={index} className={CLASS_BY_GROUP[group]}>
        {match[0]}
      </span>,
    );
    cursor = index + match[0].length;
  }

  if (cursor < code.length) nodes.push(code.slice(cursor));
  return <Fragment>{nodes}</Fragment>;
}
