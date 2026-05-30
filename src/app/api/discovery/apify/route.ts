import { NextResponse } from "next/server";

import { resolveApifyDiscoveryRequest } from "@/lib/apify-presets";
import { discoverLeadsWithApify, startLeadsDiscoveryWithApify } from "@/lib/storage";
import { apifyDiscoverySchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = apifyDiscoverySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Apify discovery request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const resolvedRequest = resolveApifyDiscoveryRequest(parsed.data);

    if (parsed.data.runAsync) {
      const result = await startLeadsDiscoveryWithApify(resolvedRequest);

      return NextResponse.json({
        status: "RUNNING",
        runId: result.runId,
        datasetId: result.datasetId,
        resolvedRequest
      }, { status: 201 });
    }

    const result = await discoverLeadsWithApify({
      ...resolvedRequest,
      onlyEmails: parsed.data.onlyEmails
    });

    return NextResponse.json({ discovery: result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Apify discovery error";
    const status = message.includes("APIFY_TOKEN") ? 501 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
