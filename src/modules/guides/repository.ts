import GuideModel, { type IGuideDocument } from "./model.js";
import type { CreateGuideDto, GuideQueryDto, UpdateGuideDto } from "./dtos.js";
import { escapeRegex } from "../../shared/environment.js";

class GuideRepository {
  public listGuides(
    tenantId: string,
    sdkIntegrationId: string,
    query: GuideQueryDto,
  ) {
    const filter: Record<string, unknown> = {
      tenantId,
      sdkIntegrationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
    };

    if (query.search) {
      const pattern = escapeRegex(query.search);
      filter.$or = [
        { title: { $regex: pattern, $options: "i" } },
        { description: { $regex: pattern, $options: "i" } },
      ];
    }

    return GuideModel.find(filter).sort({ updatedAt: -1 }).exec();
  }

  public listServableGuides(
    tenantId: string,
    sdkIntegrationId: string,
    statuses: string[],
  ) {
    return GuideModel.find({
      tenantId,
      sdkIntegrationId,
      status: { $in: statuses },
    })
      .sort({ updatedAt: -1 })
      .exec();
  }

  public getGuide(tenantId: string, sdkIntegrationId: string, guideId: string) {
    return GuideModel.findOne({
      _id: guideId,
      tenantId,
      sdkIntegrationId,
    }).exec();
  }

  public createGuide(
    tenantId: string,
    sdkIntegrationId: string,
    createdBy: string,
    dto: CreateGuideDto,
  ) {
    return GuideModel.create({
      ...dto,
      tenantId,
      sdkIntegrationId,
      createdBy,
      updatedBy: createdBy,
      analytics: {},
    });
  }

  public updateGuide(
    tenantId: string,
    sdkIntegrationId: string,
    guideId: string,
    updatedBy: string,
    dto: UpdateGuideDto,
    existing: IGuideDocument,
  ) {
    const snapshot = existing.toObject({ depopulate: true });
    return GuideModel.findOneAndUpdate(
      { _id: guideId, tenantId, sdkIntegrationId },
      {
        $set: {
          ...dto,
          updatedBy,
          version: existing.version + 1,
        },
        $push: {
          versions: {
            version: existing.version,
            changedAt: new Date(),
            changedBy: updatedBy,
            snapshot,
          },
        },
      },
      { new: true },
    ).exec();
  }

  /** Compare-and-set so two concurrent transitions cannot both apply. */
  public updateStatus(
    tenantId: string,
    sdkIntegrationId: string,
    guideId: string,
    updatedBy: string,
    from: string,
    status: "DRAFT" | "LIVE" | "PAUSED" | "ARCHIVED",
  ) {
    return GuideModel.findOneAndUpdate(
      { _id: guideId, tenantId, sdkIntegrationId, status: from },
      { $set: { status, updatedBy } },
      { new: true },
    ).exec();
  }

  public deleteGuide(
    tenantId: string,
    sdkIntegrationId: string,
    guideId: string,
  ) {
    return GuideModel.deleteOne({
      _id: guideId,
      tenantId,
      sdkIntegrationId,
    }).exec();
  }
}

export default new GuideRepository();
