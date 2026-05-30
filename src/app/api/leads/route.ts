import { NextResponse } from "next/server";

import { clearLeads, listLeads, importManualLeads } from "@/lib/storage";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaignId") ?? undefined;

  return NextResponse.json({ leads: listLeads(campaignId) });
}

export function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaignId") ?? undefined;

  return NextResponse.json({ result: clearLeads(campaignId) });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { campaignId, leads } = body;
    
    if (!campaignId || !leads || !Array.isArray(leads)) {
      return NextResponse.json(
        { error: "Missing required fields campaignId or leads array" },
        { status: 400 }
      );
    }
    
    const imported = importManualLeads(campaignId, leads);
    return NextResponse.json({ success: true, count: imported.length, leads: imported });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to import manual leads" },
      { status: 500 }
    );
  }
}
