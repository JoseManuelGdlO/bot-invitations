import type { Guest } from "./mock/types.ts";
import { extraTemplateKeys } from "./template-vars.ts";

export type ManualGuestField = {
  id: string;
  label: string;
  hint: string;
  kind: "text" | "image";
};

function labelForCustomKey(key: string) {
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function manualGuestFields(guests: Guest[]): ManualGuestField[] {
  const extras = extraTemplateKeys(guests).map((key) => ({
    id: key,
    label: labelForCustomKey(key),
    hint: `{{${key}}}`,
    kind: "text" as const,
  }));
  return [
    {
      id: "enlace",
      label: "Enlace",
      hint: "{{enlace}}",
      kind: "text",
    },
    {
      id: "image",
      label: "Imagen",
      hint: "Enlace https a un JPEG o PNG",
      kind: "image",
    },
    ...extras,
  ];
}

export function customDataFromManualFields(
  values: Record<string, string>,
) {
  const customData: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === "image") continue;
    const text = String(value ?? "").trim();
    if (text) customData[key] = text;
  }
  return customData;
}
