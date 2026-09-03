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
};

export function TemplateVariableMenu({
  variables,
  disabled = false,
  onInsert,
}: Props) {
  const empty = variables.length === 0;
  return (
    <div className="mt-3">
      <DropdownMenu>
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
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          {variables.map((key) => (
            <DropdownMenuItem
              key={key}
              onSelect={() => onInsert(`{{${key}}}`)}
            >
              {`{{${key}}}`}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
