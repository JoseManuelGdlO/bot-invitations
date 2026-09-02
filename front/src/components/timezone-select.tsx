import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_EVENT_TIMEZONE,
  normalizeTimezoneValue,
  resolveTimezoneOptions,
} from "@/lib/timezones";

type TimezoneSelectProps = {
  value?: string;
  disabled?: boolean;
  onChange: (timezone: string) => void;
};

export function TimezoneSelect({
  value,
  disabled,
  onChange,
}: TimezoneSelectProps) {
  const selected = normalizeTimezoneValue(value || DEFAULT_EVENT_TIMEZONE);
  const options = resolveTimezoneOptions(selected);

  return (
    <div className="space-y-2">
      <Label htmlFor="event-timezone">Zona horaria</Label>
      <Select
        value={selected}
        disabled={disabled}
        onValueChange={(next) => onChange(normalizeTimezoneValue(next))}
      >
        <SelectTrigger id="event-timezone" aria-label="Zona horaria">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
