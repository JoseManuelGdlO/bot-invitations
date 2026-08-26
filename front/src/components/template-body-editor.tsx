import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TEMPLATE_VARIABLES } from "@/lib/template-vars";

type Props = {
  value: string;
  onChange: (body: string) => void;
  onSave: (body: string) => void;
  rows?: number;
};

export function TemplateBodyEditor({ value, onChange, onSave, rows = 8 }: Props) {
  const [body, setBody] = useState(value);

  useEffect(() => {
    setBody(value);
  }, [value]);

  const set = (next: string) => {
    setBody(next);
    onChange(next);
  };

  return (
    <>
      <Textarea
        value={body}
        onChange={(e) => set(e.target.value)}
        rows={rows}
        className="font-sans text-sm leading-relaxed"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {TEMPLATE_VARIABLES.map((v) => (
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
      <Button className="mt-4" onClick={() => onSave(body)}>
        <Save className="size-4" /> Guardar
      </Button>
    </>
  );
}
