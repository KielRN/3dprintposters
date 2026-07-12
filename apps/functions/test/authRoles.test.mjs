import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isAnonymousAuth,
  rolesFromAuth,
} from "../lib/authRoles.js";

test("rolesFromAuth grants admin access to every console role", () => {
  const roles = rolesFromAuth({
    uid: "admin-1",
    token: { role: "admin", email: "admin@example.com" },
  });

  assert.equal(roles.isAdmin, true);
  assert.equal(roles.isOperator, true);
  assert.equal(roles.isUser, true);
  assert.equal(roles.role, "admin");
});

test("rolesFromAuth grants operator without admin", () => {
  const roles = rolesFromAuth({
    uid: "operator-1",
    token: { operator: true, email: "operator@example.com" },
  });

  assert.equal(roles.isAdmin, false);
  assert.equal(roles.isOperator, true);
  assert.equal(roles.isUser, true);
  assert.equal(roles.role, "operator");
});

test("rolesFromAuth treats non-anonymous accounts as customer users", () => {
  const roles = rolesFromAuth({
    uid: "user-1",
    token: {
      firebase: { sign_in_provider: "password" },
      email: "user@example.com",
    },
  });

  assert.equal(roles.isAdmin, false);
  assert.equal(roles.isOperator, false);
  assert.equal(roles.isUser, true);
  assert.equal(roles.role, "user");
});

test("anonymous sessions are not customer users", () => {
  const auth = {
    uid: "anon-1",
    token: { firebase: { sign_in_provider: "anonymous" } },
  };

  assert.equal(isAnonymousAuth(auth), true);
  assert.equal(rolesFromAuth(auth).isUser, false);
});
