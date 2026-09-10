import crypto from "crypto";
import bcrypt from "bcryptjs";
import AnalyticsKeyModel, {
  IAnalyticsKeyDocument,
} from "../../../modules/analytics/models/analytics-key.model.js";
import AnalyticsEventModel from "../models/analytics-event.model.js";

class HttpError extends Error {
  public status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

interface AnalyticsKeyDto {
  id: string;
  name: string;
  key?: string; // Only present when key is first created
  maskedKey: string;
  status: string;
  createdAt: Date;
}

interface StatsDto {
  totalEvents: number;
  uniqueUsers: number;
  totalSessions: number;
  eventsByDay: { date: string; count: number }[];
  eventsByName: { name: string; count: number }[];
}

class AnalyticsService {
  private generateRawKey(): string {
    return `ak_${crypto.randomBytes(24).toString("hex")}`;
  }

  private async hashKey(key: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(key, salt);
  }

  public async generateKey(
    userId: string,
    name: string,
  ): Promise<AnalyticsKeyDto> {
    if (!name || name.trim().length === 0) {
      throw new HttpError(400, "Key name is required");
    }

    // Generate the raw key (shown only once to user)
    const rawKey = this.generateRawKey();

    // Hash the key for storage
    const hashedKey = await this.hashKey(rawKey);

    const analyticsKey = await AnalyticsKeyModel.create({
      userId,
      name: name.trim(),
      hashedKey,
      status: "active",
    });

    return this.keyToDto(analyticsKey, rawKey);
  }

  public async listKeys(userId: string): Promise<AnalyticsKeyDto[]> {
    const keys = await AnalyticsKeyModel.find({ userId }).sort({
      createdAt: -1,
    });
    return keys.map((k) => this.keyToDto(k));
  }

  public async revokeKey(userId: string, keyId: string): Promise<void> {
    const key = await AnalyticsKeyModel.findOne({ _id: keyId, userId });

    if (!key) {
      throw new HttpError(404, "Key not found");
    }

    key.status = "revoked";
    await key.save();
  }

  public async regenerateKey(
    userId: string,
    keyId: string,
  ): Promise<AnalyticsKeyDto> {
    const keyRecord = await AnalyticsKeyModel.findOne({ _id: keyId, userId });

    if (!keyRecord) {
      throw new HttpError(404, "Key not found");
    }

    // Generate new raw key (shown only once)
    const newRawKey = this.generateRawKey();
    const newHashedKey = await this.hashKey(newRawKey);

    keyRecord.hashedKey = newHashedKey;
    keyRecord.status = "active"; // Ensure it's active if it was revoked
    await keyRecord.save();

    return this.keyToDto(keyRecord, newRawKey);
  }

  private async verifyApiKey(
    apiKey: string,
  ): Promise<IAnalyticsKeyDocument | null> {
    // Get all active keys and check each one (for bcrypt comparison)
    const activeKeys = await AnalyticsKeyModel.find({ status: "active" });

    for (const keyDoc of activeKeys) {
      const isMatch = await bcrypt.compare(apiKey, keyDoc.hashedKey);
      if (isMatch) {
        return keyDoc;
      }
    }
    return null;
  }

  public async ingestBatch(apiKey: string, events: any[]): Promise<void> {
    const keyRecord = await this.verifyApiKey(apiKey);

    if (!keyRecord) {
      throw new HttpError(401, "Invalid or revoked API key");
    }

    const eventsToInsert = events.map((e) => ({
      keyId: keyRecord._id.toString(),
      userId: e.userId || keyRecord.userId,
      sessionId: e.sessionId,
      eventName: e.event || "unknown",
      properties: e.properties || {},
      timestamp: e.timestamp ? new Date(e.timestamp) : new Date(),
      sdkVersion: e.context?.library?.version,
      context: e.context || {},
    }));

    await AnalyticsEventModel.insertMany(eventsToInsert);
  }

  public async ingestEvent(
    apiKey: string,
    eventName: string,
    properties: any,
    metadata: any = {},
  ): Promise<void> {
    const keyRecord = await this.verifyApiKey(apiKey);

    if (!keyRecord) {
      throw new HttpError(401, "Invalid or revoked API key");
    }

    await AnalyticsEventModel.create({
      keyId: keyRecord._id.toString(),
      userId: metadata.userId || keyRecord.userId,
      sessionId: metadata.sessionId || "unknown",
      eventName,
      properties: properties || {},
      timestamp: new Date(),
      context: metadata.context || {},
    });
  }

  public async getEvents(
    userId: string,
    query: {
      keyId?: string;
      eventName?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const userKeys = await AnalyticsKeyModel.find({ userId });
    const userKeyIds = userKeys.map((k) => k._id.toString());

    const matchQuery: any = {
      keyId: { $in: userKeyIds },
    };

    if (query.keyId) {
      matchQuery.keyId = query.keyId;
    }
    if (query.eventName) {
      matchQuery.eventName = query.eventName;
    }

    const limit = query.limit || 50;
    const offset = query.offset || 0;

    const events = await AnalyticsEventModel.find(matchQuery)
      .sort({ timestamp: -1 })
      .skip(offset)
      .limit(limit);

    const total = await AnalyticsEventModel.countDocuments(matchQuery);

    return { events, total, limit, offset };
  }

  public async getStats(userId: string, keyId?: string): Promise<StatsDto> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const userKeys = await AnalyticsKeyModel.find({ userId });
    const userKeyIds = userKeys.map((k) => k._id.toString());

    const matchQuery: any = { keyId: { $in: userKeyIds } };
    if (keyId) {
      matchQuery.keyId = keyId;
    }

    const [totalEvents, uniqueUsers, totalSessions, dailyStats, nameStats] =
      await Promise.all([
        AnalyticsEventModel.countDocuments(matchQuery),
        AnalyticsEventModel.distinct("userId", matchQuery).then(
          (res) => res.length,
        ),
        AnalyticsEventModel.distinct("sessionId", matchQuery).then(
          (res) => res.length,
        ),
        AnalyticsEventModel.aggregate([
          { $match: { ...matchQuery, timestamp: { $gte: sevenDaysAgo } } },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        AnalyticsEventModel.aggregate([
          { $match: matchQuery },
          {
            $group: {
              _id: "$eventName",
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
      ]);

    return {
      totalEvents,
      uniqueUsers,
      totalSessions,
      eventsByDay: dailyStats.map((s) => ({ date: s._id, count: s.count })),
      eventsByName: nameStats.map((s) => ({ name: s._id, count: s.count })),
    };
  }

  private keyToDto(
    key: IAnalyticsKeyDocument,
    rawKey?: string,
  ): AnalyticsKeyDto {
    const maskedKey = `ak_••••••••${key.hashedKey.slice(-4)}`;

    return {
      id: key._id.toString(),
      name: key.name,
      ...(rawKey && { key: rawKey }),
      maskedKey,
      status: key.status,
      createdAt: key.createdAt,
    };
  }
}

const analyticsService = new AnalyticsService();
export default analyticsService;
