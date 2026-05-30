import { NextResponse } from "next/server";
import { checkApifyLeadDiscoveryStatus } from "@/lib/apify-discovery";
import { importApifyDiscoveryResults } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { runId, datasetId, campaignId, sourceKey, maxItems, onlyEmails, mapping } = body;

    if (!runId || !datasetId || !campaignId) {
      return NextResponse.json(
        { error: "Missing required fields: runId, datasetId, campaignId" },
        { status: 400 }
      );
    }

    // 1. Check Apify status
    const { status, datasetId: actualDatasetId } = await checkApifyLeadDiscoveryStatus(runId);

    // 2. If succeeded, import the leads
    if (status === "SUCCEEDED") {
      const result = await importApifyDiscoveryResults(
        {
          campaignId,
          sourceKey,
          maxItems: maxItems ?? 25,
          onlyEmails: onlyEmails ?? false,
          mapping: mapping ?? {}
        } as any,
        actualDatasetId || datasetId,
        runId
      );

      return NextResponse.json({
        status: "COMPLETED",
        discovery: result
      });
    }

    if (status === "FAILED" || status === "TIMED-OUT" || status === "ABORTED") {
      return NextResponse.json({
        status: "FAILED",
        error: `Apify run ended with status: ${status}`
      });
    }

    // Still running
    return NextResponse.json({
      status: "RUNNING"
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to verify discovery status" },
      { status: 500 }
    );
  }
}
