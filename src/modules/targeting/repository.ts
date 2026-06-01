import TargetingSegmentModel from "./model.js";
import type {
  CreateTargetingSegmentDto,
  UpdateTargetingSegmentDto,
} from "./dtos.js";

class TargetingRepository {
  public listSegments(tenantId: string) {
    return TargetingSegmentModel.find({ tenantId })
      .sort({ createdAt: -1 })
      .exec();
  }

  public getSegment(tenantId: string, segmentId: string) {
    return TargetingSegmentModel.findOne({ _id: segmentId, tenantId }).exec();
  }

  public createSegment(
    tenantId: string,
    createdBy: string,
    dto: CreateTargetingSegmentDto,
  ) {
    return TargetingSegmentModel.create({
      tenantId,
      createdBy,
      ...dto,
    });
  }

  public updateSegment(
    tenantId: string,
    segmentId: string,
    updatedBy: string,
    dto: UpdateTargetingSegmentDto,
  ) {
    return TargetingSegmentModel.findOneAndUpdate(
      { _id: segmentId, tenantId },
      { $set: { ...dto, updatedBy } },
      { new: true },
    ).exec();
  }

  public deleteSegment(tenantId: string, segmentId: string) {
    return TargetingSegmentModel.deleteOne({ _id: segmentId, tenantId }).exec();
  }
}

export default new TargetingRepository();
