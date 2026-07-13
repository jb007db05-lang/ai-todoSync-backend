import SdkIntegrationModel, {
  type ISdkIntegrationDocument,
  type SdkIntegrationStatus,
} from "./model.js";

export const findByKeyHash = (
  sdkKeyHash: string,
): Promise<ISdkIntegrationDocument | null> =>
  SdkIntegrationModel.findOne({ sdkKeyHash }).exec();

export const findByTenantId = (
  tenantId: string,
): Promise<ISdkIntegrationDocument[]> =>
  SdkIntegrationModel.find({ tenantId }).sort({ createdAt: -1 }).exec();

export const findById = (id: string): Promise<ISdkIntegrationDocument | null> =>
  SdkIntegrationModel.findById(id).exec();

export const findByTenantAndId = (
  tenantId: string,
  id: string,
): Promise<ISdkIntegrationDocument | null> =>
  SdkIntegrationModel.findOne({ _id: id, tenantId }).exec();

export const createIntegration = (
  data: Omit<
    ISdkIntegrationDocument,
    "_id" | "createdAt" | "updatedAt" | "id"
  >,
): Promise<ISdkIntegrationDocument> => SdkIntegrationModel.create(data);

export const updateStatus = (
  id: string,
  status: SdkIntegrationStatus,
): Promise<ISdkIntegrationDocument | null> =>
  SdkIntegrationModel.findByIdAndUpdate(id, { status }, { new: true }).exec();

export const updateSdkKey = (
  id: string,
  sdkKey: string,
  sdkKeyHash: string,
): Promise<ISdkIntegrationDocument | null> =>
  SdkIntegrationModel.findByIdAndUpdate(
    id,
    { sdkKey, sdkKeyHash, status: "pending" },
    { new: true },
  ).exec();

export const updateConnectionTracking = (
  id: string,
  data: {
    sdkVersion?: string;
    latestOrigin?: string;
    touchRuntime?: boolean;
    touchEvent?: boolean;
    touchHeartbeat?: boolean;
  },
): Promise<ISdkIntegrationDocument | null> => {
  const now = new Date();
  const update: Record<string, unknown> = {
    lastConnectedAt: now,
    $inc: { connectionCount: 1 },
    status: "connected",
  };

  if (data.sdkVersion) update.sdkVersion = data.sdkVersion;
  if (data.latestOrigin) update.latestOrigin = data.latestOrigin;
  if (data.touchRuntime) update.lastRuntimeRequestAt = now;
  if (data.touchEvent) update.lastEventRequestAt = now;
  if (data.touchHeartbeat) update.lastHeartbeatAt = now;

  return SdkIntegrationModel.findOneAndUpdate(
    { _id: id, firstConnectedAt: null },
    { ...update, firstConnectedAt: now },
    { new: true },
  )
    .exec()
    .then((doc) => {
      if (doc) return doc;
      // Already connected before — update without setting firstConnectedAt
      const { firstConnectedAt: _omit, ...restUpdate } = update as Record<
        string,
        unknown
      >;
      void _omit;
      return SdkIntegrationModel.findByIdAndUpdate(id, restUpdate, {
        new: true,
      }).exec();
    });
};

export const deleteIntegration = (id: string): Promise<void> =>
  SdkIntegrationModel.findByIdAndDelete(id)
    .exec()
    .then(() => undefined);

export const updateIntegration = (
  id: string,
  data: {
    name?: string;
    environment?: string;
    domain?: string;
    description?: string;
  },
): Promise<ISdkIntegrationDocument | null> =>
  SdkIntegrationModel.findByIdAndUpdate(id, data, { new: true }).exec();
