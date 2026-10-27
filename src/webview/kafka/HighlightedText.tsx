import { splitHighlights } from '../../core/kafka/textHighlight';

export function HighlightedText({ text }: { text: string }) {
  return (
    <>
      {splitHighlights(text).map((segment, index) =>
        segment.kind ? (
          <mark key={index} className={`kafka-highlight kafka-highlight-${segment.kind}`}>
            {segment.text}
          </mark>
        ) : (
          segment.text
        ),
      )}
    </>
  );
}
