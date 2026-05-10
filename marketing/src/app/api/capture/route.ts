import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { scoreLead } from "@/lib/scoring";
import { transitionLead, isValidTransition } from "@/lib/funnel";
import { FunnelStage, LeadSource } from "@prisma/client";

const CaptureSchema = z.object({
  email: z.string().email(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  company: z.string().max(200).optional(),
  jobTitle: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  website: z.string().url().optional().or(z.literal("")),
  source: z.nativeEnum(LeadSource).optional(),
  utmSource: z.string().max(100).optional(),
  utmMedium: z.string().max(100).optional(),
  utmCampaign: z.string().max(100).optional(),
  utmContent: z.string().max(100).optional(),
  utmTerm: z.string().max(100).optional(),
  referrer: z.string().max(500).optional(),
  page: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: true }); // always return success to avoid enumeration
  }

  const parsed = CaptureSchema.safeParse(body);
  if (!parsed.success) {
    // Still return success — don't leak validation details to the public endpoint
    return NextResponse.json({ success: true });
  }

  const data = parsed.data;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? undefined;
  const userAgent = req.headers.get("user-agent") ?? undefined;
  const now = new Date();

  try {
    const lead = await prisma.lead.upsert({
      where: { email: data.email },
      create: {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        company: data.company,
        jobTitle: data.jobTitle,
        phone: data.phone,
        website: data.website || undefined,
        source: data.source ?? LeadSource.OTHER,
        utmSource: data.utmSource,
        utmMedium: data.utmMedium,
        utmCampaign: data.utmCampaign,
        utmContent: data.utmContent,
        utmTerm: data.utmTerm,
        referrer: data.referrer,
        ipAddress: ip,
        userAgent: userAgent,
        stage: FunnelStage.CAPTURED,
        lastActivityAt: now,
      },
      update: {
        firstName: data.firstName ?? undefined,
        lastName: data.lastName ?? undefined,
        company: data.company ?? undefined,
        jobTitle: data.jobTitle ?? undefined,
        phone: data.phone ?? undefined,
        website: data.website || undefined,
        lastActivityAt: now,
      },
    });

    // Fire FORM_SUBMIT event
    await prisma.analyticsEvent.create({
      data: {
        leadId: lead.id,
        type: "FORM_SUBMIT",
        page: data.page,
        referrer: data.referrer,
        ipAddress: ip,
        userAgent: userAgent,
        occurredAt: now,
      },
    });

    // Async score + auto-qualify (non-blocking — don't await in the response path)
    void scoreAndMaybeQualify(lead.id).catch((err) =>
      console.error("Background scoring failed for lead", lead.id, err)
    );
  } catch (err) {
    console.error("Capture error:", err);
    // Still return success to avoid leaking DB errors
  }

  return NextResponse.json({ success: true });
}

async function scoreAndMaybeQualify(leadId: string) {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
  });
  const events = await prisma.analyticsEvent.findMany({
    where: { leadId },
    orderBy: { occurredAt: "desc" },
    take: 200,
  });

  const { score, scoreBreakdown } = scoreLead(lead, events);

  await prisma.lead.update({
    where: { id: leadId },
    data: { score, scoreBreakdown: scoreBreakdown as unknown as Record<string, number> },
  });

  // Auto-advance CAPTURED → QUALIFIED when score threshold is met
  if (lead.stage === FunnelStage.CAPTURED && score >= 60 && isValidTransition(lead.stage, FunnelStage.QUALIFIED)) {
    await transitionLead(leadId, FunnelStage.QUALIFIED, "auto-score");
  }
}
