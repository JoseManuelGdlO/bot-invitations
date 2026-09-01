import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import * as auth from "../controllers/auth.controller.js";
import * as events from "../controllers/events.controller.js";
import * as guests from "../controllers/guests.controller.js";
import * as conversations from "../controllers/conversations.controller.js";
import * as eventData from "../controllers/event-data.controller.js";
import * as team from "../controllers/team.controller.js";
import * as analytics from "../controllers/analytics.controller.js";
import * as admin from "../controllers/admin.controller.js";
import * as billing from "../controllers/billing.controller.js";
import * as finance from "../controllers/finance.controller.js";
import * as support from "../controllers/support.controller.js";
import * as cancellation from "../controllers/cancellation.controller.js";
import * as help from "../controllers/help.controller.js";
import * as integrations from "../controllers/integrations.controller.js";
// import * as whatsappConnect from "../controllers/whatsapp-connect.controller.js";
import * as whatsappMeta from "../controllers/whatsapp-meta.controller.js";
import * as botDev from "../controllers/bot-dev.controller.js";
import { requireAdmin } from "../middleware/admin.js";
import { env } from "../config/env.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
export const router = Router();

router.get("/plans", auth.listPlans);
router.post("/auth/register", auth.register);
router.post("/auth/register-invite", auth.registerInvite);
router.get("/auth/email-available", auth.emailAvailable);
router.post("/auth/login", auth.login);
router.post("/auth/refresh", auth.refresh);
router.post("/auth/logout", auth.logout);
router.post("/auth/forgot-password", auth.forgotPassword);
router.post("/auth/reset-password", auth.resetPassword);
router.get("/auth/invitation", auth.invitationStatus);
router.get("/billing/session/:sessionId", billing.confirmSession);

router.use(requireAuth);

router.get("/auth/me", auth.me);
router.get("/dashboard", auth.dashboard);
router.get("/help/suggestions", help.suggestions);
router.post("/help/chat", help.chat);
router.post("/billing/checkout", billing.checkout);
router.post("/billing/portal", billing.portal);
router.get("/billing/cancellation", cancellation.getMine);
router.post("/billing/cancellation", cancellation.createMine);
router.delete("/billing/cancellation", cancellation.withdrawMine);
router.get("/activity", analytics.listActivity);

router.get("/integrations", integrations.listIntegrations);
router.post("/integrations", integrations.createIntegration);
router.patch("/integrations/:id", integrations.patchIntegration);
router.delete("/integrations/:id", integrations.deleteIntegration);
router.post("/integrations/:id/credentials", integrations.postIntegrationCredentials);
router.post("/integrations/:id/test", integrations.postIntegrationTest);
router.get("/internal/whatsapp/status", whatsappMeta.getWhatsappMetaStatus);
router.post("/internal/whatsapp/credentials", whatsappMeta.postWhatsappMetaCredentials);
router.post("/internal/whatsapp/send-test", whatsappMeta.postWhatsappMetaSendTest);
// WhatsApp Connect (QR / status / send-test) — desconectado
// router.post("/internal/whatsapp/qr-link", whatsappConnect.postWhatsappConnectQrLink);
// router.get("/internal/whatsapp/device-status", whatsappConnect.getWhatsappConnectDeviceStatus);
// router.post("/internal/whatsapp/send-test", whatsappConnect.postWhatsappConnectSendTest);

router.get("/events", events.listEvents);
router.post("/events", events.createEvent);
router.get("/events/:eventId", events.getEvent);
router.patch("/events/:eventId", events.updateEvent);
router.delete("/events/:eventId", events.deleteEvent);

router.get("/events/:eventId/guests", events.listGuests);
router.post("/events/:eventId/guests", guests.createGuest);
router.patch("/guests/:guestId", guests.updateGuest);
router.delete("/guests/:guestId", guests.deleteGuest);
router.post("/guests/:guestId/remind", guests.remindGuest);
router.post("/events/:eventId/guests/import/preview", upload.single("file"), guests.previewImport);
router.post("/events/:eventId/guests/import/confirm", guests.confirmImport);
router.get("/events/:eventId/guests/export", guests.exportGuests);
router.get("/events/:eventId/final-list/export", guests.exportFinalList);

router.get("/events/:eventId/conversations", conversations.listConversations);
router.patch("/conversations/:conversationId", conversations.toggleConversation);
router.post("/conversations/:conversationId/messages", conversations.sendMessage);
router.post("/events/:eventId/campaigns/launch", conversations.launchCampaign);
router.get("/events/:eventId/campaigns/current", conversations.getCurrentCampaign);

router.get("/events/:eventId/ai-config", eventData.getAi);
router.get("/events/:eventId/ai-config/defaults", eventData.getAiDefaults);
router.patch("/events/:eventId/ai-config", eventData.updateAi);
router.post("/events/:eventId/ai-config/reset", eventData.resetAi);
router.post("/events/:eventId/ai-config/regenerate-prompt", eventData.regeneratePrompt);
router.put("/events/:eventId/templates", eventData.setTemplates);
router.put("/events/:eventId/faqs", eventData.setFaqs);

if (env.botDevEnabled) {
  router.get("/dev/bot/status", botDev.status);
  router.get("/dev/events/:eventId/bot/prompt", botDev.getPromptPreview);
  router.get("/dev/events/:eventId/bot/playground", botDev.getPlayground);
  router.post("/dev/events/:eventId/bot/playground", botDev.postPlayground);
  router.post("/dev/conversations/:conversationId/simulate-guest", botDev.simulateGuest);
}

router.get("/events/:eventId/members", team.listMembers);
router.post("/events/:eventId/members", team.inviteMember);
router.patch("/events/:eventId/members/:memberId", team.updateMember);
router.delete("/events/:eventId/members/:memberId", team.deleteMember);
router.get("/events/:eventId/role-permissions", team.listPermissions);
router.patch("/events/:eventId/role-permissions/:permissionId", team.updatePermission);

router.get("/events/:eventId/analytics", analytics.getAnalytics);
router.get("/events/:eventId/activity", analytics.listActivity);

router.get("/support/tickets", support.listMine);
router.post("/support/tickets", support.createMine);
router.get("/support/unread", support.unreadMine);
router.get("/support/tickets/:ticketId", support.getMine);
router.post("/support/tickets/:ticketId/messages", support.replyMine);
router.patch("/support/tickets/:ticketId", support.closeMine);

router.get("/admin/overview", requireAdmin, admin.overview);
router.get("/admin/finance", requireAdmin, finance.snapshot);
router.get("/admin/clients", requireAdmin, admin.listClients);
router.patch("/admin/clients/:userId", requireAdmin, admin.updateClient);
router.get("/admin/plans", requireAdmin, admin.listPlans);
router.patch("/admin/plans/:planId", requireAdmin, admin.updatePlan);
router.get("/admin/support/tickets", requireAdmin, support.listAll);
router.get("/admin/support/unread", requireAdmin, support.unreadAll);
router.get("/admin/support/tickets/:ticketId", requireAdmin, support.getAny);
router.post("/admin/support/tickets/:ticketId/messages", requireAdmin, support.replyAny);
router.patch("/admin/support/tickets/:ticketId", requireAdmin, support.updateAny);
router.get("/admin/cancellations", requireAdmin, cancellation.listAll);
router.get("/admin/cancellations/unread", requireAdmin, cancellation.unread);
router.post("/admin/cancellations/:requestId/approve", requireAdmin, cancellation.approve);
router.post("/admin/cancellations/:requestId/reject", requireAdmin, cancellation.reject);
