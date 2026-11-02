import { AI_INFLUENZA_PACKAGES, type AiInfluenzaPackageId } from "./ai-influenza-team-logic";
import { buildAiInfluenzaDeliveryBriefs } from "./ai-influenza-delivery-logic";

/**
 * A generated text draft is not proof that a contracted image or video exists.
 * Fail closed: the sales launch gate stays blocked until asset production and
 * customer delivery are independently verified.
 */
export type AiInfluenzaLaunchGap = {
  taskKind: string;
  quantity: number;
  reason: string;
};

export type AiInfluenzaLaunchReadiness = {
  packageId: AiInfluenzaPackageId;
  readyForUnattendedFulfilment: boolean;
  gaps: AiInfluenzaLaunchGap[];
};

export function assessAiInfluenzaLaunchReadiness(packageId: AiInfluenzaPackageId): AiInfluenzaLaunchReadiness {
  const contracted = AI_INFLUENZA_PACKAGES[packageId].defaultMonthlyTaskBatches;
  const briefs = buildAiInfluenzaDeliveryBriefs(packageId);
  const gaps: AiInfluenzaLaunchGap[] = [];

  for (const task of contracted) {
    const brief = briefs.find((entry) => entry.taskKind === task.kind);
    if (!brief || brief.quantity !== task.quantity) {
      gaps.push({ taskKind: task.kind, quantity: task.quantity, reason: "Contract and delivery plan differ." });
      continue;
    }
    if (brief.renderPipeline === "draft-only") {
      gaps.push({
        taskKind: task.kind,
        quantity: task.quantity,
        reason: "Only a draft or brief is generated; finished assets and delivery are not proven.",
      });
    } else if (brief.renderPipeline === "media-pipeline") {
      gaps.push({
        taskKind: task.kind,
        quantity: task.quantity,
        reason: "Media pipeline is configured, but rendered assets and customer approval are not proven.",
      });
    } else {
      gaps.push({
        taskKind: task.kind,
        quantity: task.quantity,
        reason: "Report or plan generation is configured; customer acceptance and delivery are not proven.",
      });
    }
  }
  return { packageId, readyForUnattendedFulfilment: gaps.length === 0, gaps };
}
