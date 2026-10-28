/* 从 LianAgent 迁移的 CodeMirror 文稿编辑器，宿主管理选区与历史。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { markdown, markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown';
import { defaultKeymap } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import type { FormatAction } from './documentEditing';
import styles from './ResearchTools.module.css';
import { MAX_PAPER_BYTES, paperByteLength } from '../paperWriting';

const writingHighlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '600', color: 'var(--yf-text-primary)' },
  { tag: tags.heading1, fontSize: '20px', fontWeight: '600', color: 'var(--yf-text-primary)' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.link, color: 'var(--yf-text-secondary)', textDecoration: 'underline' },
  { tag: [tags.processingInstruction, tags.meta], color: 'var(--yf-text-secondary)' },
  { tag: tags.monospace, fontFamily: 'monospace', color: 'var(--yf-text-secondary)' },
]);

export type WritingEditorHandle = { focus: () => void; setSelectionRange: (start: number, end: number) => void };
type Props = {
  ref: Ref<WritingEditorHandle>;
  value: string;
  label: string;
  placeholder: string;
  onChange: (content: string, selection: [number, number]) => void;
  onSelect: (selection: [number, number]) => void;
  onUndo: () => void;
  onRedo: () => void;
  onFormat: (action: FormatAction) => void;
  onLimit: () => void;
};

// SQLite 文稿与工具撤销历史仍由宿主维护，编辑器只同步正文和选区。
export function WritingEditor(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const current = useRef(props); current.current = props;
  const syncing = useRef(false);
  useImperativeHandle(props.ref, () => ({
    focus: () => view.current?.focus(),
    setSelectionRange: (start, end) => {
      const editor = view.current; if (!editor) return;
      const length = editor.state.doc.length;
      const anchor = Math.max(0, Math.min(start, length)); const head = Math.max(0, Math.min(end, length));
      const selection = editor.state.selection.main;
      if (selection.from === Math.min(anchor, head) && selection.to === Math.max(anchor, head)) return;
      syncing.current = true;
      try { editor.dispatch({ selection: { anchor, head } }); } finally { syncing.current = false; }
    },
  }), []);
  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({ parent: host.current, state: EditorState.create({ doc: current.current.value, extensions: [
      EditorState.transactionFilter.of((transaction) => {
        if (!transaction.docChanged || paperByteLength(transaction.newDoc.toString()) <= MAX_PAPER_BYTES) return transaction;
        current.current.onLimit(); return [];
      }),
      markdown({ base: markdownLanguage, addKeymap: false, completeHTMLTags: false }), syntaxHighlighting(writingHighlight), EditorView.lineWrapping,
      placeholder(current.current.placeholder),
      EditorView.contentAttributes.of({ 'aria-label': current.current.label, spellcheck: 'false', autocapitalize: 'off' }),
      keymap.of([
        { key: 'Mod-z', run: () => { current.current.onUndo(); return true; } },
        { key: 'Mod-Shift-z', run: () => { current.current.onRedo(); return true; } },
        { key: 'Mod-y', run: () => { current.current.onRedo(); return true; } },
        { key: 'Mod-b', run: () => { current.current.onFormat('bold'); return true; } },
        { key: 'Mod-i', run: () => { current.current.onFormat('italic'); return true; } },
        ...markdownKeymap, ...defaultKeymap,
      ]),
      EditorView.updateListener.of((update) => {
        if (syncing.current) return;
        const { from, to } = update.state.selection.main;
        if (update.docChanged) current.current.onChange(update.state.doc.toString(), [from, to]);
        else if (update.selectionSet) current.current.onSelect([from, to]);
      }),
      EditorView.theme({
        '&': { height: '100%', color: 'var(--yf-text-primary)', backgroundColor: 'transparent' },
        '&.cm-focused': { outline: 'none' },
        '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.9', overflow: 'auto' },
        '.cm-content': { padding: '24px', minHeight: '320px', caretColor: 'var(--yf-text-primary)' },
        '.cm-line': { padding: '0' },
        '.cm-placeholder': { color: 'var(--yf-text-secondary)' },
        '.cm-cursor': { borderLeftColor: 'var(--yf-text-primary)' },
      }),
    ] }) });
    view.current = editor;
    return () => { view.current = null; editor.destroy(); };
  }, []);
  useEffect(() => {
    const editor = view.current; if (!editor) return;
    const before = editor.state.doc.toString(); const after = props.value;
    if (before === after) return;
    // 仅更新变化区段，保留滚动、输入法和其余文稿位置。
    let start = 0; let endBefore = before.length; let endAfter = after.length;
    while (start < endBefore && start < endAfter && before[start] === after[start]) start++;
    while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) { endBefore--; endAfter--; }
    syncing.current = true;
    try { editor.dispatch({ changes: { from: start, to: endBefore, insert: after.slice(start, endAfter) } }); }
    finally { syncing.current = false; }
  }, [props.value]);
  return <div ref={host} className={styles.writingEditor} />;
}
