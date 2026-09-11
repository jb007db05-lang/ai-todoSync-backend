import PromptExecutionLogModel from "../../prompt/models/prompt-execution-log.model.js";
import type { ILlmModel } from "../models/llm-model.model.js";
import { HttpError } from "../../../shared/errors/http-error.js";

export interface CostCalculationResult {
  inputCost: number;
  outputCost: number;
  cachedCost: number;
  totalCost: number;
}

export class CostControlService {
  /**
   * Calculate cost in USD based on input, output, and cached token counts
   * using per-million-token pricing from catalog.
   */
  public calculateCost(
    model: ILlmModel,
    inputTokens: number,
    outputTokens: number,
    cachedTokens = 0,
  ): CostCalculationResult {
    const inputPricePerToken = (model.inputPricePerMToken || 0) / 1_000_000;
    const outputPricePerToken = (model.outputPricePerMToken || 0) / 1_000_000;
    const cachedPricePerToken =
      (model.cachedInputPricePerMToken || 0) / 1_000_000;

    const uncachedInput = Math.max(0, inputTokens - cachedTokens);
    const inputCost = uncachedInput * inputPricePerToken;
    const cachedCost = cachedTokens * cachedPricePerToken;
    const outputCost = outputTokens * outputPricePerToken;
    const totalCost = Number((inputCost + cachedCost + outputCost).toFixed(8));

    return {
      inputCost: Number(inputCost.toFixed(8)),
      outputCost: Number(outputCost.toFixed(8)),
      cachedCost: Number(cachedCost.toFixed(8)),
      totalCost,
    };
  }

  /**
   * Verify workspace monthly budget has not been exceeded.
   * Default budget limit: $100.00 USD per workspace per month (configurable).
   */
  public async assertWorkspaceBudget(
    workspaceId: string,
    monthlyBudgetLimitUsd = 100.0,
  ): Promise<void> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const result = await PromptExecutionLogModel.aggregate([
      {
        $match: {
          workspaceId,
          createdAt: { $gte: startOfMonth },
          status: "success",
        },
      },
      {
        $group: {
          _id: null,
          totalSpent: { $sum: "$totalCost" },
        },
      },
    ]);

    const totalSpent = result[0]?.totalSpent || 0;
    if (totalSpent >= monthlyBudgetLimitUsd) {
      throw new HttpError(
        429,
        `Workspace monthly AI execution budget ($${monthlyBudgetLimitUsd.toFixed(2)}) has been exceeded. Total spent this month: $${totalSpent.toFixed(2)}.`,
      );
    }
  }
}

export default new CostControlService();
