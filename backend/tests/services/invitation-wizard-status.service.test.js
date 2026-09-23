import { jest } from "@jest/globals";
import { loadWithMocks } from "../helpers/loadWithMocks.js";
import { createInstance } from "../helpers/models.js";

describe("invitation-wizard-status.service", () => {
  let service;
  let models;

  beforeEach(async () => {
    ({ mod: service, models } = await loadWithMocks(
      "src/services/invitation-wizard-status.service.js",
    ));
  });

  test("isInvitationWizardRequired solo es true con pending", () => {
    expect(service.isInvitationWizardRequired("pending")).toBe(true);
    expect(service.isInvitationWizardRequired("completed")).toBe(false);
    expect(service.isInvitationWizardRequired("skipped")).toBe(false);
    expect(service.isInvitationWizardRequired(null)).toBe(false);
    expect(service.isInvitationWizardRequired(undefined)).toBe(false);
  });

  test("markInvitationWizardPending solo escribe pending si el status es null", async () => {
    const user = createInstance({ id: "usr_1", invitationWizardStatus: null });
    models.User.findByPk.mockResolvedValue(user);

    await service.markInvitationWizardPending("usr_1");

    expect(user.update).toHaveBeenCalledWith({ invitationWizardStatus: "pending" });
  });

  test("markInvitationWizardPending no cambia completed ni skipped", async () => {
    for (const status of ["completed", "skipped", "pending"]) {
      const user = createInstance({ id: "usr_1", invitationWizardStatus: status });
      models.User.findByPk.mockResolvedValue(user);
      await service.markInvitationWizardPending("usr_1");
      expect(user.update).not.toHaveBeenCalled();
    }
  });

  test("markInvitationWizardSkipped solo pasa de pending a skipped", async () => {
    const pending = createInstance({ id: "usr_1", invitationWizardStatus: "pending" });
    models.User.findByPk.mockResolvedValue(pending);
    await service.markInvitationWizardSkipped("usr_1");
    expect(pending.update).toHaveBeenCalledWith({ invitationWizardStatus: "skipped" });

    const completed = createInstance({ id: "usr_1", invitationWizardStatus: "completed" });
    models.User.findByPk.mockResolvedValue(completed);
    await service.markInvitationWizardSkipped("usr_1");
    expect(completed.update).not.toHaveBeenCalled();
  });

  test("markInvitationWizardCompleted marca completed siempre que exista el usuario", async () => {
    const user = createInstance({ id: "usr_1", invitationWizardStatus: "pending" });
    models.User.findByPk.mockResolvedValue(user);
    await service.markInvitationWizardCompleted("usr_1");
    expect(user.update).toHaveBeenCalledWith({ invitationWizardStatus: "completed" });
  });

  test("getInvitationWizardRequired lee el usuario", async () => {
    models.User.findByPk.mockResolvedValue(
      createInstance({ id: "usr_1", invitationWizardStatus: "pending" }),
    );
    await expect(service.getInvitationWizardRequired("usr_1")).resolves.toBe(true);

    models.User.findByPk.mockResolvedValue(
      createInstance({ id: "usr_1", invitationWizardStatus: "skipped" }),
    );
    await expect(service.getInvitationWizardRequired("usr_1")).resolves.toBe(false);
  });
});
