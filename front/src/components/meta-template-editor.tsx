import { useEffect, useRef, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TemplateVariableMenu } from "@/components/template-variable-menu";
import { flattenTemplateLine, splitMetaBody } from "@/lib/template-vars";
import { insertAtCursor, wrapSelection } from "@/lib/whatsapp-markup";

type Props = {
  bodyText: string;
  footerText?: string | null;
  values: string[];
  variables?: string[];
  disabled?: boolean;
  onChange: (values: string[]) => void;
  onSave: (values: string[]) => void;
};

export function MetaTemplateEditor({
  bodyText,
  footerText,
  values,
  variables = [],
  disabled = false,
  onChange,
  onSave,
}: Props) {
  const [focused, setFocused] = useState(0);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const segments = splitMetaBody(bodyText);
  const slotCount = values.length;

  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, slotCount);
  }, [slotCount]);

  const setSlot = (index: number, nextValue: string) => {
    const next = values.map((value, i) =>
      i === index ? flattenTemplateLine(nextValue) : value,
    );
    onChange(next);
  };

  const restoreSelection = (index: number, start: number, end: number) => {
    requestAnimationFrame(() => {
      const el = inputRefs.current[index];
      if (!el) return;
      el.focus();
      el.setSelectionRange(start, end);
    });
  };

  const applyWrap = (left: string, right: string = left) => {
    const index = Math.min(Math.max(focused, 0), Math.max(slotCount - 1, 0));
    const body = values[index] ?? "";
    const el = inputRefs.current[index];
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const next = wrapSelection(body, start, end, left, right);
    setSlot(index, next.text);
    restoreSelection(index, next.selectionStart, next.selectionEnd);
  };

  const insertToken = (token: string) => {
    const index = Math.min(Math.max(focused, 0), Math.max(slotCount - 1, 0));
    const body = values[index] ?? "";
    const el = inputRefs.current[index];
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const padded =
      start > 0 && !/\s$/.test(body.slice(0, start)) ? ` ${token}` : token;
    const next = insertAtCursor(body, start, end, padded);
    setSlot(index, next.text);
    restoreSelection(index, next.selectionStart, next.selectionEnd);
  };

  return (
    <>
      <div className="rounded-xl border border-border bg-secondary/30 p-3 font-sans text-sm leading-relaxed whitespace-pre-wrap">
        {segments.map((segment, i) => {
          if (segment.type === "text") {
            return <span key={`t-${i}`}>{segment.value}</span>;
          }
          return (
            <Input
              key={`s-${segment.key}-${i}`}
              ref={(el) => {
                inputRefs.current[segment.index] = el;
              }}
              value={values[segment.index] ?? ""}
              disabled={disabled}
              onFocus={() => setFocused(segment.index)}
              onChange={(e) => setSlot(segment.index, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
                if (!(e.metaKey || e.ctrlKey)) return;
                if (e.key === "b" || e.key === "B") {
                  e.preventDefault();
                  applyWrap("*");
                } else if (e.key === "i" || e.key === "I") {
                  e.preventDefault();
                  applyWrap("_");
                }
              }}
              placeholder={`{{${segment.key}}}`}
              className="my-0.5 inline-flex h-8 w-[min(100%,18rem)] min-w-[8rem] align-middle text-sm"
            />
          );
        })}
      </div>
      {footerText ? (
        <p className="mt-2 text-xs text-muted-foreground">{footerText}</p>
      ) : null}
      <TemplateVariableMenu
        variables={variables}
        disabled={disabled || slotCount === 0}
        onInsert={insertToken}
      />
      <Button
        className="mt-4"
        disabled={disabled}
        onClick={() => onSave(values.map((value) => flattenTemplateLine(value)))}
      >
        <Save className="size-4" /> Guardar
      </Button>
    </>
  );
}
