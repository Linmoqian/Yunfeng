/* 右键编辑使用打开菜单时的选区，异步剪贴板返回后核对元素仍然连接。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
export function captureEditTarget(target: HTMLElement) {
  const input = target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.selectionStart !== null) ? target : null;
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  const editable = input ?? target.closest<HTMLElement>('[contenteditable="true"]');
  const start = input?.selectionStart ?? 0;
  const end = input?.selectionEnd ?? 0;
  const text = input ? input.value.slice(start, end) : selection?.toString() ?? "";
  const canEdit = Boolean(editable && !(input?.disabled || input?.readOnly));
  function replace(value: string) {
    if (!editable?.isConnected || !canEdit) return;
    editable.focus();
    if (input) input.setRangeText(value, start, end, "end");
    else if (range && editable.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      const node = document.createTextNode(value);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    editable.dispatchEvent(new Event("input", { bubbles: true }));
  }
  return { text, canEdit, editable, async run(action: string) {
    if (action === "copy") await navigator.clipboard.writeText(text);
    if (action === "cut" && canEdit) { await navigator.clipboard.writeText(text); replace(""); }
    if (action === "paste" && canEdit) replace(await navigator.clipboard.readText());
    if (action === "selectAll") {
      if (input) { input.focus(); input.select(); }
      else { const all = document.createRange(); all.selectNodeContents(editable ?? document.querySelector("main") ?? document.body); selection?.removeAllRanges(); selection?.addRange(all); }
    }
  } };
}
