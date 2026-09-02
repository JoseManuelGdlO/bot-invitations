import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bold, Code, Italic, Save, Strikethrough } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TEMPLATE_VARIABLES } from "@/lib/template-vars";
import { insertAtCursor, wrapSelection } from "@/lib/whatsapp-markup";

type Props = {
  value: string;
  onChange: (body: string) => void;
  onSave: (body: string) => void;
  rows?: number;
  prefix?: ReactNode;
  suffix?: ReactNode;
  extraVariables?: string[];
};

export function TemplateBodyEditor({
  value,
  onChange,
  onSave,
  rows = 8,
  prefix,
  suffix,
  extraVariables = [],
}: Props) {
  const [body, setBody] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setBody(value);
  }, [value]);

  const set = (next: string) => {
    setBody(next);
    onChange(next);
  };

  const restoreSelection = (start: number, end: number) => {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(start, end);
    });
  };

  const applyWrap = (left: string, right: string = left) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const next = wrapSelection(body, start, end, left, right);
    set(next.text);
    restoreSelection(next.selectionStart, next.selectionEnd);
  };

  const insertToken = (token: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const padded =
      start > 0 && !/\s$/.test(body.slice(0, start)) ? ` ${token}` : token;
    const next = insertAtCursor(body, start, end, padded);
    set(next.text);
    restoreSelection(next.selectionStart, next.selectionEnd);
  };

  return (
    <>
      {prefix}
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          title="Negrita"
          onClick={() => applyWrap("*")}
        >
          <Bold />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          title="Cursiva"
          onClick={() => applyWrap("_")}
        >
          <Italic />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          title="Tachado"
          onClick={() => applyWrap("~")}
        >
          <Strikethrough />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          title="Monoespaciado"
          onClick={() => applyWrap("```")}
        >
          <Code />
        </Button>
        <p className="ml-1 text-[11px] text-muted-foreground">
          Enter para saltos. *negrita*, _cursiva_, ~tachado~.
        </p>
      </div>
      <Textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => set(e.target.value)}
        onKeyDown={(e) => {
          if (!(e.metaKey || e.ctrlKey)) return;
          if (e.key === "b" || e.key === "B") {
            e.preventDefault();
            applyWrap("*");
          } else if (e.key === "i" || e.key === "I") {
            e.preventDefault();
            applyWrap("_");
          }
        }}
        rows={rows}
        className="font-sans text-sm leading-relaxed"
      />
      {suffix}
      <div className="mt-3 flex flex-wrap gap-2">
        {[
          ...TEMPLATE_VARIABLES,
          ...extraVariables.filter(
            (key) => !(TEMPLATE_VARIABLES as readonly string[]).includes(key),
          ),
        ].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => insertToken(`{{${v}}}`)}
            className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] transition-colors hover:bg-gold-soft"
          >
            {`{{${v}}}`}
          </button>
        ))}
      </div>
      <Button className="mt-4" onClick={() => onSave(body)}>
        <Save className="size-4" /> Guardar
      </Button>
    </>
  );
}
