import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  variables: string[];
  disabled?: boolean;
  onInsert: (token: string) => void;
  formatToken?: (key: string) => string;
  labelFor?: (key: string) => string;
};

export function TemplateVariableMenu({
  variables,
  disabled = false,
  onInsert,
  formatToken = (key) => `{{${key}}}`,
  labelFor,
}: Props) {
  const empty = variables.length === 0;
  return (
    <div className="mt-3">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || empty}
          >
            Insertar variable
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="z-[80] max-h-72 overflow-y-auto"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {variables.map((key) => (
            <DropdownMenuItem
              key={key}
              onSelect={() => onInsert(formatToken(key))}
            >
              {labelFor ? labelFor(key) : `{{${key}}}`}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
