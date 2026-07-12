import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const projectId =
  process.env.GCLOUD_PROJECT ??
  process.env.GOOGLE_CLOUD_PROJECT ??
  "gen-lang-client-0675309660";

const assignments = [
  {
    uid: "MrhjHC39aITsz72NFHgYoZ92JQD2",
    role: "admin",
    label: "Admin",
    claims: {
      role: "admin",
      admin: true,
      operator: true,
      user: true,
      checkout: true,
    },
  },
  {
    uid: "12bbjlrBZQc7GPZk9M8kWdv9Xpz1",
    role: "operator",
    label: "Operator",
    claims: {
      role: "operator",
      admin: false,
      operator: true,
      user: false,
      checkout: false,
    },
  },
  {
    uid: "eZ11PWp8aqfpzdPQYckjWOM7cVh2",
    role: "user",
    label: "User",
    claims: {
      role: "user",
      admin: false,
      operator: false,
      user: true,
      checkout: true,
    },
  },
];

function hasFlag(name) {
  return process.argv.includes(name);
}

function publicClaims(claims) {
  return {
    role: claims.role ?? null,
    admin: claims.admin === true,
    operator: claims.operator === true,
    user: claims.user === true,
    checkout: claims.checkout === true,
  };
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  initializeApp({ projectId });
  const auth = getAuth();
  const db = getFirestore();

  const results = [];
  for (const assignment of assignments) {
    const user = await auth.getUser(assignment.uid);
    const nextClaims = {
      ...(user.customClaims ?? {}),
      ...assignment.claims,
    };
    results.push({
      uid: assignment.uid,
      email: user.email ?? null,
      role: assignment.role,
      claims: publicClaims(nextClaims),
    });

    if (dryRun) {
      continue;
    }

    await auth.setCustomUserClaims(assignment.uid, nextClaims);
    await db.collection("users").doc(assignment.uid).set(
      {
        email: user.email ?? null,
        role: assignment.role,
        roles: publicClaims(nextClaims),
        roleLabel: assignment.label,
        roleSeededAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  if (!dryRun) {
    await db.collection("adminConfig").doc("figurineWorkflow").set(
      {
        roleGate: {
          enabled: true,
          requiredRole: "admin",
          note: "Admin workflow controls, operator tools, and customer checkout are enforced by Firebase Auth custom claims plus non-anonymous customer accounts.",
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  console.log(
    JSON.stringify(
      {
        projectId,
        dryRun,
        seeded: dryRun ? false : true,
        users: results,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
        code: error?.code ?? null,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
