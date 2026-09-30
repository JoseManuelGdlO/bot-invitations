import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  readStagedSpreadsheet,
  stageSpreadsheet,
} from "../../src/services/import-staging.service.js";

describe("import-staging.service", () => {
  test("solo el mismo usuario y evento pueden releer el archivo", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "import-stage-"));
    const token = await stageSpreadsheet({
      userId: "usr_1",
      eventId: "evt_1",
      buffer: Buffer.from("xlsx"),
      filename: "lista.xlsx",
      root,
    });
    const staged = await readStagedSpreadsheet({ token, userId: "usr_1", eventId: "evt_1", root });
    expect(staged.buffer.toString()).toBe("xlsx");
    await expect(readStagedSpreadsheet({
      token,
      userId: "usr_2",
      eventId: "evt_1",
      root,
    })).rejects.toThrow(/expiró/);
  });
});
