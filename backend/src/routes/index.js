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

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
export const router = Router();

router.get("/plans", auth.listPlans);
router.post("/auth/register", auth.register);
router.post("/auth/login", auth.login);
router.post("/auth/refresh", auth.refresh);
router.post("/auth/logout", auth.logout);
router.post("/auth/forgot-password", auth.forgotPassword);
router.post("/auth/reset-password", auth.resetPassword);

router.use(requireAuth);

router.get("/auth/me", auth.me);
router.get("/dashboard", auth.dashboard);
router.get("/activity", analytics.listActivity);

router.get("/events", events.listEvents);
router.post("/events", events.createEvent);
router.get("/events/:eventId", events.getEvent);
router.patch("/events/:eventId", events.updateEvent);

router.get("/events/:eventId/guests", events.listGuests);
router.post("/events/:eventId/guests", guests.createGuest);
router.patch("/guests/:guestId", guests.updateGuest);
router.post("/guests/:guestId/remind", guests.remindGuest);
router.post("/events/:eventId/guests/import/preview", upload.single("file"), guests.previewImport);
router.post("/events/:eventId/guests/import/confirm", guests.confirmImport);
router.get("/events/:eventId/guests/export", guests.exportGuests);
router.get("/events/:eventId/final-list/export", guests.exportFinalList);

router.get("/events/:eventId/conversations", conversations.listConversations);
router.patch("/conversations/:conversationId", conversations.toggleConversation);
router.post("/conversations/:conversationId/messages", conversations.sendMessage);
router.post("/events/:eventId/campaigns/launch", conversations.launchCampaign);

router.get("/events/:eventId/ai-config", eventData.getAi);
router.patch("/events/:eventId/ai-config", eventData.updateAi);
router.put("/events/:eventId/templates", eventData.setTemplates);
router.put("/events/:eventId/faqs", eventData.setFaqs);

router.get("/events/:eventId/members", team.listMembers);
router.post("/events/:eventId/members", team.inviteMember);
router.patch("/events/:eventId/members/:memberId", team.updateMember);
router.delete("/events/:eventId/members/:memberId", team.deleteMember);
router.get("/events/:eventId/role-permissions", team.listPermissions);
router.patch("/events/:eventId/role-permissions/:permissionId", team.updatePermission);

router.get("/events/:eventId/analytics", analytics.getAnalytics);
router.get("/events/:eventId/activity", analytics.listActivity);
