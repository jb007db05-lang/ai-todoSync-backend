import GuideModel, { type IGuideDocument } from "./model.js";
import type { CreateGuideDto, GuideQueryDto, UpdateGuideDto } from "./dtos.js";

class GuideRepository {
  public listGuides(tenantId: string, query: GuideQueryDto) {
    const filter: Record<string, unknown> = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
    };

    if (query.search) {
      filter.$or = [
        { title: { $regex: query.search, $options: "i" } },
        { description: { $regex: query.search, $options: "i" } },
      ];
    }

    return GuideModel.find(filter).sort({ updatedAt: -1 }).exec();
  }

  public listLiveGuides(tenantId: string) {
    return GuideModel.find({ tenantId, status: "LIVE" })
      .sort({ priority: -1, updatedAt: -1 })
      .exec();
  }

  public getGuide(tenantId: string, guideId: string) {
    return GuideModel.findOne({ _id: guideId, tenantId }).exec();
  }

  public createGuide(tenantId: string, createdBy: string, dto: CreateGuideDto) {
    return GuideModel.create({
      ...dto,
      tenantId,
      createdBy,
      updatedBy: createdBy,
      analytics: {},
    });
  }

  public updateGuide(
    tenantId: string,
    guideId: string,
    updatedBy: string,
    dto: UpdateGuideDto,
    existing: IGuideDocument,
  ) {
    const snapshot = existing.toObject({ depopulate: true });
    return GuideModel.findOneAndUpdate(
      { _id: guideId, tenantId },
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

  public updateStatus(
    tenantId: string,
    guideId: string,
    updatedBy: string,
    status: "DRAFT" | "LIVE" | "PAUSED" | "ARCHIVED",
  ) {
    return GuideModel.findOneAndUpdate(
      { _id: guideId, tenantId },
      { $set: { status, updatedBy } },
      { new: true },
    ).exec();
  }

  public deleteGuide(tenantId: string, guideId: string) {
    return GuideModel.deleteOne({ _id: guideId, tenantId }).exec();
  }
}

export default new GuideRepository();
