/* 文稿格式化与稳定引用键，迁移自 LianAgent。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */

import type { Reference } from './model';

export function citationKey(reference: Reference) { return `ref-${reference.id}`; }
export function withCitations(content: string, references: Reference[]): string {
  const cited = references.filter((reference) => content.includes(`[^${citationKey(reference)}]`) && !content.includes(`[^${citationKey(reference)}]:`));
  return content + (cited.length ? '\n\n' + cited.map((reference) => `[^${citationKey(reference)}]: ${reference.title.replace(/\s+/g, ' ')}${reference.citation ? `. ${reference.citation.replace(/\s+/g, ' ')}` : ''}${reference.url ? `. <${reference.url}>` : ''}`).join('\n') + '\n' : '');
}
export type FormatAction = 'bold' | 'italic' | 'heading' | 'list' | 'quote';
export function formatSelection(content: string, range: [number, number], action: FormatAction) {
  const [start, end] = range;
  const selected = content.slice(start, end);
  const wrap = action === 'bold' ? '**' : '*';
  if (action === 'bold' || action === 'italic') {
    if (selected && content.slice(start - wrap.length, start) === wrap && content.slice(end, end + wrap.length) === wrap) {
      return { content: content.slice(0, start - wrap.length) + selected + content.slice(end + wrap.length), selection: [start - wrap.length, end - wrap.length] as [number, number] };
    }
    const text = selected || '文字';
    return { content: content.slice(0, start) + wrap + text + wrap + content.slice(end), selection: [start + wrap.length, start + wrap.length + text.length] as [number, number] };
  }
  const lineStart = content.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = content.indexOf('\n', end);
  const finish = lineEnd === -1 ? content.length : lineEnd;
  const prefix = action === 'heading' ? '## ' : action === 'list' ? '- ' : '> ';
  const text = content.slice(lineStart, finish).split('\n').map((line) => prefix + (action === 'heading' ? line.replace(/^#{1,6}\s+/, '') : line.replace(action === 'list' ? /^-\s+/ : /^>\s+/, ''))).join('\n');
  return { content: content.slice(0, lineStart) + text + content.slice(finish), selection: [lineStart + prefix.length, lineStart + text.length] as [number, number] };
}
