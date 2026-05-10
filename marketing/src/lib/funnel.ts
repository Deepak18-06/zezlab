import { FunnelStage, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export { FunnelStage };

export const FUNNEL_STAGE_ORDER: FunnelStage[] = [
  FunnelStage.VISITOR,
  FunnelStage.CAPTURED,
  FunnelStage.QUALIFIED,
  FunnelStage.NURTURING,
  FunnelStage.OPPORTUNITY,
  FunnelStage.CONVERTED,
];

// Valid transitions: any forward progression is allowed; CHURNED is reachable from any stage.
const VALID_TRANSITIONS: Record<FunnelStage, FunnelStage[]> = {
  [FunnelStage.VISITOR]: [FunnelStage.CAPTURED, FunnelStage.CHURNED],
  [FunnelStage.CAPTURED]: [FunnelStage.QUALIFIED, FunnelStage.NURTURING, FunnelStage.CHURNED],
  [FunnelStage.QUALIFIED]: [FunnelStage.NURTURING, FunnelStage.OPPORTUNITY, FunnelStage.CHURNED],
  [FunnelStage.NURTURING]: [FunnelStage.OPPORTUNITY, FunnelStage.CONVERTED, FunnelStage.CHURNED],
  [FunnelStage.OPPORTUNITY]: [FunnelStage.CONVERTED, FunnelStage.CHURNED],
  [FunnelStage.CONVERTED]: [FunnelStage.CHURNED],
  [FunnelStage.CHURNED]: [],
};

export function isValidTransition(from: FunnelStage, to: FunnelStage): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

type PrismaTransaction = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export async function transitionLead(
  leadId: string,
  to: FunnelStage,
  triggeredBy: string,
  tx: PrismaTransaction = prisma
) {
  const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });

  if (!isValidTransition(lead.stage, to)) {
    throw new Error(`Invalid transition: ${lead.stage} → ${to}`);
  }

  const now = new Date();

  const [updated] = await Promise.all([
    tx.lead.update({
      where: { id: leadId },
      data: {
        stage: to,
        lastActivityAt: now,
        ...(to === FunnelStage.CONVERTED ? { convertedAt: now } : {}),
        ...(to === FunnelStage.CHURNED ? { optedOutAt: now } : {}),
      },
    }),
    tx.analyticsEvent.create({
      data: {
        leadId,
        type: "STAGE_CHANGE",
        metadata: { oldStage: lead.stage, newStage: to, triggeredBy } as Prisma.InputJsonValue,
        occurredAt: now,
      },
    }),
  ]);

  return updated;
}
