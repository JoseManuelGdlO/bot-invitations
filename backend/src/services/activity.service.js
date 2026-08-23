import { Activity } from "../models/index.js";

export async function logActivity(eventId, text, kind = "system") {
  return Activity.create({ eventId, text, kind });
}
