import { useEffect, useState, type ReactNode } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { flattenTemplateLine, TEMPLATE_VARIABLES } from "@/lib/template-vars";

type Props = {
  value: string;
  onChange: (body: string) => void;
  onSave: (body: string) => void;
  rows?: number;
  flattenNewlines?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
  extraVariables?: string[];
};

export function TemplateBodyEditor({
  value,
  onChange,
  onSave,
  rows = 8,
  flattenNewlines = false,
  prefix,
  suffix,
  extraVariables = [],
}: Props) {
  const [body, setBody] = useState(value);

  useEffect(() => {
    setBody(value);
  }, [value]);

  const set = (next: string) => {
    const normalized = flattenNewlines ? next.replace(/[\r\n\t]+/g, " ") : next;
    setBody(normalized);
    onChange(normalized);
  };

  return (
    <>
      {prefix}
      <Textarea
        value={body}
        onChange={(e) => set(e.target.value)}
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
            onClick={() => set(`${body} {{${v}}}`)}
            className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] transition-colors hover:bg-gold-soft"
          >
            {`{{${v}}}`}
          </button>
        ))}
      </div>
      <Button
        className="mt-4"
        onClick={() =>
          onSave(flattenNewlines ? flattenTemplateLine(body) : body)
        }
      >
        <Save className="size-4" /> Guardar
      </Button>
    </>
  );
}
