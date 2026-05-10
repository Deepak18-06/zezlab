import { prisma } from "./prisma";
import { sendEmail } from "./mailer";

const BATCH_SIZE = 50;

export interface DrainResult {
  sent: number;
  failed: number;
  skipped: number;
}

export async function drainQueue(): Promise<DrainResult> {
  const now = new Date();

  const emails = await prisma.email.findMany({
    where: { status: "QUEUED", scheduledAt: { lte: now } },
    include: {
      lead: true,
      campaignStep: { include: { campaign: true } },
    },
    orderBy: { scheduledAt: "asc" },
    take: BATCH_SIZE,
  });

  let sent = 0;
  let failed = 0;
  const skipped = 0;

  for (const email of emails) {
    // Mark as SENDING to prevent double-processing if cron overlaps
    await prisma.email.update({
      where: { id: email.id },
      data: { status: "SENDING" },
    });

    try {
      await sendEmail({
        to: email.to,
        subject: email.subject,
        html: email.bodyHtml,
        text: email.bodyText ?? undefined,
      });

      const sentAt = new Date();

      await prisma.$transaction(async (tx) => {
        await tx.email.update({
          where: { id: email.id },
          data: { status: "SENT", sentAt },
        });

        await tx.lead.update({
          where: { id: email.leadId },
          data: { lastActivityAt: sentAt },
        });

        // Advance campaign enrollment to the next step
        if (email.campaignStep) {
          const { campaignStep } = email;

          const enrollment = await tx.campaignEnrollment.findUnique({
            where: {
              leadId_campaignId: {
                leadId: email.leadId,
                campaignId: campaignStep.campaignId,
              },
            },
          });

          if (enrollment && !enrollment.unenrolledAt && !enrollment.completedAt) {
            const nextStep = await tx.campaignStep.findUnique({
              where: {
                campaignId_position: {
                  campaignId: campaignStep.campaignId,
                  position: campaignStep.position + 1,
                },
              },
            });

            if (nextStep) {
              const nextSendAt = new Date(
                sentAt.getTime() + nextStep.delayDays * 86_400_000
              );

              await tx.email.create({
                data: {
                  leadId: email.leadId,
                  campaignStepId: nextStep.id,
                  to: email.to,
                  subject: nextStep.subject,
                  bodyHtml: nextStep.bodyHtml,
                  bodyText: nextStep.bodyText,
                  status: "QUEUED",
                  scheduledAt: nextSendAt,
                },
              });

              await tx.campaignEnrollment.update({
                where: { id: enrollment.id },
                data: {
                  currentStep: nextStep.position,
                  nextSendAt,
                },
              });
            } else {
              // No more steps — sequence complete
              await tx.campaignEnrollment.update({
                where: { id: enrollment.id },
                data: { completedAt: sentAt, nextSendAt: null },
              });
            }
          }
        }
      });

      sent++;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await prisma.email.update({
        where: { id: email.id },
        data: { status: "FAILED", failureReason: reason },
      });
      console.error(`Failed to send email ${email.id}:`, reason);
      failed++;
    }
  }

  return { sent, failed, skipped };
}
