import crypto from "crypto";
import AnalyticsKeyModel, {
  IAnalyticsKeyDocument,
} from "../models/analytics-key.model.js";
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
  key: string;
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
  public async generateKey(
    userId: string,
    name: string,
  ): Promise<AnalyticsKeyDto> {
    if (!name || name.trim().length === 0) {
      throw new HttpError(400, "Key name is required");
    }

    const key = `ak_${crypto.randomBytes(24).toString("hex")}`;

    const analyticsKey = await AnalyticsKeyModel.create({
      userId,
      name: name.trim(),
      key,
      status: "active",
    });

    return this.keyToDto(analyticsKey);
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

    const newKey = `ak_${crypto.randomBytes(24).toString("hex")}`;
    keyRecord.key = newKey;
    keyRecord.status = "active"; // Ensure it's active if it was revoked
    await keyRecord.save();

    return this.keyToDto(keyRecord);
  }

  public async ingestBatch(apiKey: string, events: any[]): Promise<void> {
    const keyRecord = await AnalyticsKeyModel.findOne({
      key: apiKey,
      status: "active",
    });

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
    const keyRecord = await AnalyticsKeyModel.findOne({
      key: apiKey,
      status: "active",
    });

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
    const matchQuery: any = {
      // Ensure we only see events for keys owned by this user
      keyId: {
        $in: (await AnalyticsKeyModel.find({ userId })).map((k) =>
          k._id.toString(),
        ),
      },
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

    // Get all keys for this user to ensure stats are only for their data
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

  private keyToDto(key: IAnalyticsKeyDocument): AnalyticsKeyDto {
    return {
      id: key._id.toString(),
      name: key.name,
      key: key.key,
      status: key.status,
      createdAt: key.createdAt,
    };
  }
}

const analyticsService = new AnalyticsService();
export default analyticsService;
