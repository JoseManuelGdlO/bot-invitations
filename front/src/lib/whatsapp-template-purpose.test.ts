import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PURPOSE_TAB_LABEL,
  showsInvitationPresets,
  templatesForPurpose,
} from "./whatsapp-template-purpose.ts";

test("templatesForPurpose agrupa por pestaña y trata vacío como invitation", () => {
  const rows = [
    { id: "a", purpose: "invitation" },
    { id: "b", purpose: "reminder" },
    { id: "c" },
  ];
  assert.deepEqual(
    templatesForPurpose(rows, "invitation").map((row) => row.id),
    ["a", "c"],
  );
  assert.deepEqual(
    templatesForPurpose(rows, "reminder").map((row) => row.id),
    ["b"],
  );
});

test("create-dialog solo muestra presets de invitación en Mensajes", () => {
  assert.equal(showsInvitationPresets("invitation"), true);
  assert.equal(showsInvitationPresets("reminder"), false);
  assert.equal(showsInvitationPresets("followup"), false);
  assert.equal(PURPOSE_TAB_LABEL.invitation, "Mensajes");
  assert.equal(PURPOSE_TAB_LABEL.reminder, "Recordatorio");
  assert.equal(PURPOSE_TAB_LABEL.followup, "Seguimiento");
});
