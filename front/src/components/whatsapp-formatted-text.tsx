import { parseWhatsAppMarkup } from "@/lib/whatsapp-markup";
import { cn } from "@/lib/utils";

type Props = {
  text: string;
  className?: string;
};

export function WhatsAppFormattedText({ text, className }: Props) {
  const segments = parseWhatsAppMarkup(text);
  return (
    <p className={cn("whitespace-pre-line break-words [overflow-wrap:anywhere]", className)}>
      {segments.map((segment, index) => {
        switch (segment.type) {
          case "strong":
            return <strong key={index}>{segment.value}</strong>;
          case "em":
            return <em key={index}>{segment.value}</em>;
          case "s":
            return <s key={index}>{segment.value}</s>;
          case "code":
            return (
              <code key={index} className="font-mono text-[0.95em]">
                {segment.value}
              </code>
            );
          default:
            return <span key={index}>{segment.value}</span>;
        }
      })}
    </p>
  );
}
