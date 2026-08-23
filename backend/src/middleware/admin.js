export function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: "No tienes acceso al backoffice." });
  }
  next();
}
