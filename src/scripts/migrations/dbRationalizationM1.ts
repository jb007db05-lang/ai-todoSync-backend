/**
 * Migration: DB Rationalization M1
 *
 * Migrates data from deleted standalone collections into embedded Project fields:
 *   - ProjectAiConfig  → Project.ai
 *   - AuditRetentionPolicy → Project.audit
 *   - ProjectState → Project.states[]
 *
 * Run ONCE before deploying the new backend build.
 * Safe to re-run: uses $setOnInsert / only updates if destination is empty.
 */

import mongoose from "mongoose";

const MONGO_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/synctodo";

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;

  const projects = db.collection("projects");
  const aiConfigs = db.collection("projectaiconfigs");
  const retentionPolicies = db.collection("auditretentionpolicies");
  const projectStates = db.collection("projectstates");

  // ── 1. Migrate ProjectAiConfig → Project.ai ──────────────────────────────
  console.log("Migrating ProjectAiConfig → Project.ai ...");
  const configs = await aiConfigs.find({}).toArray();
  for (const cfg of configs) {
    await projects.updateOne(
      { _id: cfg.projectId, "ai.provider": { $exists: false } },
      {
        $set: {
          ai: {
            enabled: cfg.enabled ?? false,
            provider: cfg.provider ?? "gemini",
            apiKey: cfg.apiKey ?? null,
            baseUrl: cfg.baseUrl ?? "",
            modelName: cfg.modelName ?? "Gemini 3.6 Flash",
          },
        },
      },
    );
  }
  console.log(`  → Migrated ${configs.length} AI configs`);

  // ── 2. Migrate AuditRetentionPolicy → Project.audit ─────────────────────
  console.log("Migrating AuditRetentionPolicy → Project.audit ...");
  const policies = await retentionPolicies.find({}).toArray();
  for (const policy of policies) {
    await projects.updateOne(
      { _id: policy.projectId, "audit.retentionDays": { $exists: false } },
      {
        $set: {
          audit: {
            retentionDays: policy.retentionDays ?? 2555,
            legalHold: policy.legalHold ?? false,
            updatedBy: policy.updatedBy ?? null,
          },
        },
      },
    );
  }
  console.log(`  → Migrated ${policies.length} retention policies`);

  // ── 3. Migrate ProjectState → Project.states[] ───────────────────────────
  console.log("Migrating ProjectState → Project.states[] ...");
  const states = await projectStates
    .find({})
    .sort({ projectId: 1, position: 1 })
    .toArray();
  const byProject = new Map<string, any[]>();
  for (const s of states) {
    const key = s.projectId.toString();
    if (!byProject.has(key)) byProject.set(key, []);
    byProject.get(key)!.push({
      _id: s._id,
      name: s.name,
      description: s.description ?? "",
      color: s.color ?? "#6B7280",
      position: s.position ?? 0,
      category: s.category ?? "STARTED",
      isDefault: s.isDefault ?? false,
      isTerminal: s.isTerminal ?? false,
    });
  }
  for (const [projectId, stateList] of byProject) {
    await projects.updateOne(
      {
        _id: new mongoose.Types.ObjectId(projectId),
        "states.0": { $exists: false },
      },
      { $set: { states: stateList } },
    );
  }
  console.log(`  → Migrated states for ${byProject.size} projects`);

  // ── 4. Verify ─────────────────────────────────────────────────────────────
  console.log("\nVerification:");
  const totalProjects = await projects.countDocuments();
  const projectsWithAi = await projects.countDocuments({
    "ai.provider": { $exists: true },
  });
  const projectsWithAudit = await projects.countDocuments({
    "audit.retentionDays": { $exists: true },
  });
  const projectsWithStates = await projects.countDocuments({
    "states.0": { $exists: true },
  });
  console.log(`  Projects total: ${totalProjects}`);
  console.log(`  Projects with embedded AI config: ${projectsWithAi}`);
  console.log(`  Projects with embedded audit policy: ${projectsWithAudit}`);
  console.log(`  Projects with embedded states: ${projectsWithStates}`);
  console.log(`  Source ai configs: ${configs.length}`);
  console.log(`  Source retention policies: ${policies.length}`);
  console.log(`  Source state documents: ${states.length}`);

  console.log("\n✅ Migration complete. You may now drop the old collections:");
  console.log("   db.projectaiconfigs.drop()");
  console.log("   db.auditretentionpolicies.drop()");
  console.log("   db.projectstates.drop()");
  console.log("   db.chattyings.drop()         ← never written, safe to drop");

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
