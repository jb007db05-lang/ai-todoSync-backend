/**
 * Builds every declared MongoDB index, first merging duplicates that would
 * block the analytics unique indexes.
 *
 *   npm run db:indexes            # apply
 *   npm run db:indexes -- --dry   # report only, change nothing
 *
 * Merges (lossless):
 *  - event registry entries with the same (eventName, sdkIntegrationId):
 *    logs are re-pointed to the oldest entry, the rest removed
 *  - event logs with the same (eventId, sdkIntegrationId): the oldest is kept
 *  - identities with the same (apiKeyId, userIdentifier): newest traits kept
 *  - monthly targeted users with the same (sdkIntegrationId, month, userId):
 *    counts summed, guide/survey ids unioned
 * Any other duplicate data blocking a unique index is reported, not changed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import mongoose from "mongoose";
import {
  connectDatabase,
  disconnectDatabase,
  ensureIndexes,
} from "../../config/db.config.js";
import AnalyticsEventRegistryModel from "../../modules/analytics/models/analytics-event-registry.model.js";
import AnalyticsLogModel from "../../modules/analytics/models/analytics-log.model.js";
import AnalyticsUserModel from "../../modules/analytics/models/analytics-user.model.js";
import { MonthlyTargetedUserModel } from "../../modules/engagement/model.js";

const DRY = process.argv.includes("--dry");

type SchemaIndex = [Record<string, unknown>, Record<string, unknown>];
/** MongoDB's default index name for a schema index. */
const indexName = ([fields, options]: SchemaIndex): string =>
  (options.name as string | undefined) ??
  Object.entries(fields)
    .map(([k, v]) => `${k}_${v}`)
    .join("_");

/** Registers every model so ensureIndexes covers all of them. */
const loadAllModels = async () => {
  const modulesDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../modules",
  );
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /(^|\.)model\.(ts|js)$/.test(entry.name) &&
        !entry.name.endsWith(".d.ts")
        ? [full]
        : [];
    });
  for (const file of walk(modulesDir)) {
    await import(pathToFileURL(file).href);
  }
};

interface DupGroup {
  _id: unknown;
  ids: mongoose.Types.ObjectId[];
  count: number;
}

const groups = (
  model: mongoose.Model<any>,
  key: Record<string, string>,
  match: Record<string, unknown> = {},
) =>
  model
    .aggregate<DupGroup>([
      { $match: match },
      { $sort: { _id: 1 } },
      { $group: { _id: key, ids: { $push: "$_id" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .allowDiskUse(true)
    .exec();

const main = async () => {
  await loadAllModels();
  await connectDatabase();
  console.log(`Models registered: ${mongoose.modelNames().length}`);
  console.log(DRY ? "DRY RUN — no changes will be made\n" : "");

  // 1. Event registry
  const registry = await groups(AnalyticsEventRegistryModel, {
    eventName: "$eventName",
    sdkIntegrationId: "$sdkIntegrationId",
  } as any);
  let repointed = 0;
  let registryRemoved = 0;
  for (const g of registry) {
    const [keep, ...drop] = g.ids;
    const dropRefs = drop.map(String);
    if (!DRY) {
      const res = await AnalyticsLogModel.updateMany(
        { eventRef: { $in: dropRefs } },
        { $set: { eventRef: String(keep) } },
      ).exec();
      repointed += res.modifiedCount;
      registryRemoved += (
        await AnalyticsEventRegistryModel.deleteMany({
          _id: { $in: drop },
        }).exec()
      ).deletedCount;
    } else {
      repointed += await AnalyticsLogModel.countDocuments({
        eventRef: { $in: dropRefs },
      }).exec();
      registryRemoved += drop.length;
    }
  }
  console.log(
    `Event registry: ${registry.length} duplicate names → ${registryRemoved} entries removed, ${repointed} logs re-pointed`,
  );

  // 2. Event logs
  const logs = await groups(
    AnalyticsLogModel,
    { eventId: "$eventId", sdkIntegrationId: "$sdkIntegrationId" } as any,
    { eventRef: { $exists: true }, eventId: { $type: "string" } },
  );
  const logDrops = logs.flatMap((g) => g.ids.slice(1));
  if (!DRY && logDrops.length)
    await AnalyticsLogModel.deleteMany({ _id: { $in: logDrops } }).exec();
  console.log(
    `Event logs: ${logs.length} duplicated event ids → ${logDrops.length} duplicate logs removed`,
  );

  // 3. Identities
  const users = await groups(AnalyticsUserModel, {
    apiKeyId: "$apiKeyId",
    userIdentifier: "$userIdentifier",
  } as any);
  let usersRemoved = 0;
  for (const g of users) {
    const [keep, ...drop] = g.ids;
    if (!DRY) {
      const newest = await AnalyticsUserModel.findById(g.ids[g.ids.length - 1])
        .lean()
        .exec();
      await AnalyticsUserModel.updateOne(
        { _id: keep },
        { $set: { metadata: newest?.metadata ?? {} } },
      ).exec();
      usersRemoved += (
        await AnalyticsUserModel.deleteMany({ _id: { $in: drop } }).exec()
      ).deletedCount;
    } else {
      usersRemoved += drop.length;
    }
  }
  console.log(
    `Identities: ${users.length} duplicated users → ${usersRemoved} removed`,
  );

  // 4. Monthly targeted users
  const mtu = await groups(MonthlyTargetedUserModel, {
    sdkIntegrationId: "$sdkIntegrationId",
    month: "$month",
    userId: "$userId",
  } as any);
  let mtuRemoved = 0;
  for (const g of mtu) {
    const [keep, ...drop] = g.ids;
    if (!DRY) {
      const docs = await MonthlyTargetedUserModel.find({ _id: { $in: g.ids } })
        .lean()
        .exec();
      await MonthlyTargetedUserModel.updateOne(
        { _id: keep },
        {
          $set: {
            exposureCount: docs.reduce((s, d) => s + (d.exposureCount ?? 0), 0),
            guideIds: [...new Set(docs.flatMap((d) => d.guideIds ?? []))],
            surveyIds: [...new Set(docs.flatMap((d) => d.surveyIds ?? []))],
            firstExposedAt: new Date(
              Math.min(
                ...docs.map((d) => new Date(d.firstExposedAt).getTime()),
              ),
            ),
            lastExposedAt: new Date(
              Math.max(...docs.map((d) => new Date(d.lastExposedAt).getTime())),
            ),
          },
        },
      ).exec();
      mtuRemoved += (
        await MonthlyTargetedUserModel.deleteMany({ _id: { $in: drop } }).exec()
      ).deletedCount;
    } else {
      mtuRemoved += drop.length;
    }
  }
  console.log(
    `Monthly targeted users: ${mtu.length} duplicates → ${mtuRemoved} merged away`,
  );

  // 5. Indexes
  if (DRY) {
    console.log("\nSkipping index build (dry run).");
  } else {
    let results = await ensureIndexes();
    // An existing index with the schema's name but other options (e.g. a
    // plain index where the schema wants TTL) blocks the build: replace it.
    const conflicts = results.filter(
      (r) => !r.ok && /same name|different options/i.test(r.error ?? ""),
    );
    for (const conflict of conflicts) {
      const model = mongoose.model(conflict.model);
      const declaredIndexes = model.schema.indexes() as SchemaIndex[];
      const wanted = new Set(declaredIndexes.map(indexName));
      const existing = await model.collection.indexes();
      for (const index of existing) {
        if (index.name && index.name !== "_id_" && wanted.has(index.name)) {
          const declared = declaredIndexes.find(
            (i) => indexName(i) === index.name,
          );
          const opts = declared?.[1] ?? {};
          const differs =
            Boolean(opts.unique) !== Boolean(index.unique) ||
            (opts.expireAfterSeconds ?? null) !==
              (index.expireAfterSeconds ?? null);
          if (differs) {
            console.log(
              `  replacing ${conflict.model}.${index.name} to match the schema`,
            );
            await model.collection.dropIndex(index.name);
          }
        }
      }
    }
    if (conflicts.length) results = await ensureIndexes();
    const failed = results.filter((r) => !r.ok);
    console.log(
      `\nIndexes: ${results.length - failed.length}/${results.length} models OK`,
    );
    failed.forEach((f) => console.log(`  ✗ ${f.model}: ${f.error}`));
    if (failed.length) process.exitCode = 1;
  }

  await disconnectDatabase();
};

main().catch(async (error) => {
  console.error(error);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
