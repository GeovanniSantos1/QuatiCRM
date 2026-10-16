import { jwtVerify, type JWTVerifyGetKey } from "jose";

/** Only signed claims may identify a resident; profile permissions stay in our database. */
export async function verifyClerkIdentity(
  token: string,
  options: { issuer: string; origin: string },
  keys: JWTVerifyGetKey,
): Promise<{ id: string; email: string; name: string; emailVerified: true }> {
  const { payload } = await jwtVerify(token, keys, {
    issuer: options.issuer,
    audience: "quati-crm",
    algorithms: ["RS256"],
    clockTolerance: 5,
    maxTokenAge: "2m",
    requiredClaims: ["exp", "iat", "nbf", "sub", "sid", "azp"],
  });
  if (
    payload.azp !== options.origin ||
    payload.sts === "pending" ||
    typeof payload.sub !== "string" ||
    !payload.sub.startsWith("user_") ||
    typeof payload.sid !== "string" ||
    !payload.sid.startsWith("sess_") ||
    payload.quati_email_verified !== true ||
    typeof payload.quati_email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.quati_email)
  )
    throw new Error("Identidade não validada.");
  const email = payload.quati_email.trim().toLowerCase();
  return {
    id: payload.sub,
    email,
    emailVerified: true,
    name:
      typeof payload.quati_name === "string" && payload.quati_name.trim()
        ? payload.quati_name.trim().slice(0, 200)
        : email.split("@")[0],
  };
}
