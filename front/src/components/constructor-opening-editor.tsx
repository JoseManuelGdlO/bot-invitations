import { Check, ChevronDown } from "lucide-react";
import { TemplateBodyEditor } from "@/components/template-body-editor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  flattenTemplateLine,
  normalizeGreetingVar,
  TEMPLATE_VARIABLES,
  type TemplateVariable,
} from "@/lib/template-vars";

type Props = {
  greetingVar: string;
  body: string;
  onGreetingVarChange: (key: TemplateVariable) => void;
  onChange: (body: string) => void;
  onSave: (next: { body: string; greetingVar: TemplateVariable }) => void;
};

export function ConstructorOpeningEditor({
  greetingVar,
  body,
  onGreetingVarChange,
  onChange,
  onSave,
}: Props) {
  const selected = normalizeGreetingVar(greetingVar);

  return (
    <TemplateBodyEditor
      value={body}
      onChange={onChange}
      flattenNewlines
      rows={5}
      prefix={
        <div className="mb-2 space-y-2 font-sans text-sm leading-relaxed">
          <p>
            ¡Hola, buen día!{" "}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-0.5 font-medium text-foreground transition-colors hover:bg-gold-soft"
                >
                  {`{{${selected}}}`}
                  <ChevronDown className="size-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {TEMPLATE_VARIABLES.map((v) => (
                  <DropdownMenuItem
                    key={v}
                    onSelect={() => onGreetingVarChange(v)}
                  >
                    <span className="flex w-4 justify-center">
                      {v === selected ? <Check className="size-3.5" /> : null}
                    </span>
                    {`{{${v}}}`}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </p>
          <p>Nos comunicamos de</p>
        </div>
      }
      suffix={
        <p className="mt-2 font-sans text-sm leading-relaxed">Muchas gracias.</p>
      }
      onSave={(nextBody) =>
        onSave({
          body: flattenTemplateLine(nextBody),
          greetingVar: selected,
        })
      }
    />
  );
}
