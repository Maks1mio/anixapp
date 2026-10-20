/**
 * Tiny, safe Markdown → HTML for agent answers.
 * Everything is HTML-escaped first; then only a whitelist is re-introduced:
 * **bold**, *italic*, `code`, ### headings, - / 1. lists, paragraphs, line breaks.
 * Links are rendered as plain text (the model must not inject URLs).
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[\s(«])\*([^*\n]+)\*(?=[\s).,!?:;»]|$)/g, '$1<em>$2</em>')
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, '$1');
}

/** Leaked model tool-call markup (DeepSeek DSML / tool▁calls) — cut from display. */
const LEAKED_TOOL_MARKUP = /<\s*[|｜]{1,3}\s*(?:DSML|tool[▁_\s]*calls?[▁_\s]*begin|tool[▁_\s]*call[▁_\s]*begin|tool[▁_\s]*sep)/i;

export function renderAgentMarkdown(src: string): string {
  const leak = LEAKED_TOOL_MARKUP.exec(src);
  const lines = (leak ? src.slice(0, leak.index) : src).replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const kind = ul ? 'ul' : 'ol';
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
    } else if (h) {
      flushPara();
      closeList();
      out.push(`<h4>${inline(h[1])}</h4>`);
    } else if (!line.trim()) {
      flushPara();
      closeList();
    } else {
      closeList();
      para.push(line.trim());
    }
  }
  flushPara();
  closeList();
  return out.join('');
}
