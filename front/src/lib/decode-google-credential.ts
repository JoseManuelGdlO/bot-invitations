export function decodeGoogleCredential(idToken: string): {
  email: string;
  name: string;
} {
  try {
    const part = idToken.split(".")[1];
    if (!part) return { email: "", name: "" };
    let padded = part.replace(/-/g, "+").replace(/_/g, "/");
    while (padded.length % 4) padded += "=";
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const payload = JSON.parse(json) as {
      email?: string;
      name?: string;
      given_name?: string;
      family_name?: string;
    };
    const name =
      [payload.given_name, payload.family_name].filter(Boolean).join(" ").trim() ||
      String(payload.name || "").trim();
    return {
      email: String(payload.email || "").trim().toLowerCase(),
      name,
    };
  } catch {
    return { email: "", name: "" };
  }
}
