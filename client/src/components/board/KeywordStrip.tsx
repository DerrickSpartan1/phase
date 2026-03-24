import { memo, useMemo } from "react";

import type { Keyword } from "../../adapter/types";
import {
  getKeywordDisplayText,
  isGrantedKeyword,
  sortKeywords,
} from "../../viewmodel/keywordProps";

interface KeywordStripProps {
  keywords: Keyword[];
  baseKeywords: Keyword[];
}

export const KeywordStrip = memo(function KeywordStrip({ keywords, baseKeywords }: KeywordStripProps) {
  const sorted = useMemo(() => sortKeywords(keywords), [keywords]);

  const items = useMemo(
    () =>
      sorted.map((kw) => ({
        text: getKeywordDisplayText(kw),
        granted: isGrantedKeyword(kw, baseKeywords),
      })),
    [sorted, baseKeywords],
  );

  if (items.length === 0) return null;

  const fullText = items.map((i) => i.text).join(" \u00B7 ");

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-20 overflow-hidden truncate bg-black/60 px-1 py-[1px] text-[9px] leading-tight"
      title={fullText}
    >
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <span className="text-gray-500"> &middot; </span>}
          <span className={item.granted ? "text-indigo-300" : "text-white"}>
            {item.text}
          </span>
        </span>
      ))}
    </div>
  );
});
