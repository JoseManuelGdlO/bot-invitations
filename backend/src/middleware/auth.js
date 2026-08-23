import { User } from "../models/index.js";
import { verifyAccess } from "../utils/tokens.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : req.cookies?.accessToken;
    if (!token) {
      return res.status(401).json({ error: "No autenticado" });
    }
    const payload = verifyAccess(token);
    const user = await User.findByPk(payload.sub);
    if (!user) return res.status(401).json({ error: "Sesión inválida" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}
