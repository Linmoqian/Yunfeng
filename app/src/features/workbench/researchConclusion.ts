/* 从既有结论原文提取展示标签，不计算指标或推断验收结果。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
export type ConclusionMetric = { text: string; status?: "passed" | "failed" };

/** 无明确指标时保留正文；限制与待处理信息始终可见，全文供展开核对。 */
export function summarizeConclusion(body: string): { metrics: ConclusionMetric[]; notices: string[] } {
  const metrics: ConclusionMetric[] = [];
  const hypothetical = /目标|希望|预计|预期|计划|要求|假设|至少|如果|若|一旦|是否|可能/;
  const facts = body.split(/[，。；\n]/).filter((clause) => !hypothetical.test(clause));
  const measured = facts.filter((clause) => !/未|不|没有/.test(clause)).join("，");
  const gain = /(?:提升|提高|增加|减小|降低|减少|下降|改善)(?:了|约)?\s*[+-]?\d+(?:\.\d+)?\s*(?:个百分点|%|％)/.exec(measured);
  if (gain) metrics.push({ text: gain[0] });
  const ratio = /压缩比(?:约|为)?\s*\d+(?:\.\d+)?\s*(?:%|％)/.exec(measured);
  if (ratio) metrics.push({ text: ratio[0] });
  const sentences = body.match(/[^。；\n]+[。；]?/g) ?? [body];
  const negative = /未|不|待|尚|失败|风险|假设|需|限制|错误|异常|低于|false|仅|可能|疑似|估计|预计|预期/;
  const failed = /(?:节点)?验收(?:未通过|失败)/.exec(facts.join("，"));
  const passed = sentences.find((sentence) => !negative.test(sentence) && !hypothetical.test(sentence.split("验收")[0]) && /验收(?:条件[^。；\n]*?实测)?通过/.test(sentence));
  if (failed) metrics.push({ text: failed[0], status: "failed" });
  else if (passed) {
    metrics.push({ text: /节点验收通过/.test(passed) ? "节点验收通过" : "验收通过", status: "passed" });
  }
  const roundtrip = /\broundtrip\s*=\s*(true|false)\b/.exec(measured);
  if (roundtrip) {
    const passed = roundtrip[1] === "true";
    const text = /压缩|解压/.test(body) ? (passed ? "解压一致" : "解压不一致") : (passed ? "往返校验通过" : "往返校验失败");
    metrics.push({ text, status: passed ? "passed" : "failed" });
  }
  const notices = metrics.length ? sentences.filter((sentence) => negative.test(sentence)).map((sentence) => {
    // 只翻译既有实验的明确复核状态；不泛化删除未知限制、错误和不确定性。
    if (/reviewApproved\s*=\s*false/.test(sentence) && /等待.*复核/.test(sentence)
      && !/风险|失败|错误|异常|限制|仅|可能|疑似|估计|预计|预期|尚未/.test(sentence)) return "等待你复核，确认后继续。";
    return sentence.trim();
  }) : [];
  return { metrics, notices: [...new Set(notices)] };
}
