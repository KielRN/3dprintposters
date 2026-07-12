import { HttpsError } from "firebase-functions/v2/https";

export type CallableAuth = {
  uid: string;
  token?: Record<string, unknown>;
};

export type AuthPrincipal = {
  uid: string;
  email: string | null;
};

export type ConsoleRoles = {
  principal: AuthPrincipal;
  role: "admin" | "operator" | "user" | null;
  isAdmin: boolean;
  isOperator: boolean;
  isUser: boolean;
};

function stringClaim(token: Record<string, unknown> | undefined, key: string) {
  const value = token?.[key];
  return typeof value === "string" ? value.toLowerCase() : "";
}

function booleanClaim(token: Record<string, unknown> | undefined, key: string) {
  return token?.[key] === true;
}

export function authPrincipal(auth: CallableAuth): AuthPrincipal {
  return {
    uid: auth.uid,
    email: typeof auth.token?.email === "string" ? auth.token.email : null,
  };
}

export function isAnonymousAuth(auth: CallableAuth): boolean {
  const firebaseClaim = auth.token?.firebase;
  if (!firebaseClaim || typeof firebaseClaim !== "object") {
    return false;
  }

  const provider = (firebaseClaim as Record<string, unknown>).sign_in_provider;
  return provider === "anonymous";
}

export function requireSignedInAccount(request: {
  auth?: CallableAuth;
}): AuthPrincipal {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Create an account or sign in first.");
  }

  if (isAnonymousAuth(request.auth)) {
    throw new HttpsError(
      "permission-denied",
      "Create an account or sign in before continuing.",
    );
  }

  return authPrincipal(request.auth);
}

export function rolesFromAuth(auth: CallableAuth): ConsoleRoles {
  const role = stringClaim(auth.token, "role");
  const isAdmin = role === "admin" || booleanClaim(auth.token, "admin");
  const isOperator =
    isAdmin || role === "operator" || booleanClaim(auth.token, "operator");
  const isUser =
    isAdmin ||
    isOperator ||
    role === "user" ||
    booleanClaim(auth.token, "user") ||
    !isAnonymousAuth(auth);

  return {
    principal: authPrincipal(auth),
    role: isAdmin ? "admin" : isOperator ? "operator" : isUser ? "user" : null,
    isAdmin,
    isOperator,
    isUser,
  };
}

export function requireAdminRole(request: {
  auth?: CallableAuth;
}): AuthPrincipal {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Sign in with an admin account first.",
    );
  }

  const roles = rolesFromAuth(request.auth);
  if (!roles.isAdmin) {
    throw new HttpsError(
      "permission-denied",
      "This account is not assigned the admin role.",
    );
  }

  return roles.principal;
}

export function requireOperatorRole(request: {
  auth?: CallableAuth;
}): AuthPrincipal {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }

  const roles = rolesFromAuth(request.auth);
  if (!roles.isOperator) {
    throw new HttpsError(
      "permission-denied",
      "This account is not assigned the operator role.",
    );
  }

  return roles.principal;
}
