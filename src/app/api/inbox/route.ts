import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { listDashboardData } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { connectionId, limit = 10 } = body;

    if (!connectionId) {
      return NextResponse.json({ error: "Missing active connection ID" }, { status: 400 });
    }

    // Retrieve the active email connection details securely from our database storage
    const dbData = listDashboardData();
    const connection = dbData.emailConnections.find((conn) => conn.id === connectionId);

    if (!connection) {
      return NextResponse.json({ error: "Active email connection credentials not found" }, { status: 404 });
    }

    // Map SMTP provider/host to corresponding IMAP configuration
    // Standard cPanel/Custom SMTP servers typically use the same host for SMTP and IMAP
    let imapHost = connection.smtpHost;
    let imapPort = 993; // Secure IMAP default SSL/TLS port
    let isSecure = true;

    // Handle standard public providers overrides
    if (connection.provider === "gmail") {
      imapHost = "imap.gmail.com";
      imapPort = 993;
    } else if (connection.provider === "outlook") {
      imapHost = "outlook.office365.com";
      imapPort = 993;
    }

    console.log(`Live IMAP Sync: Connecting to ${imapHost}:${imapPort} for user ${connection.smtpUser}`);

    const client = new ImapFlow({
      host: imapHost,
      port: imapPort,
      secure: isSecure,
      auth: {
        user: connection.smtpUser,
        pass: connection.smtpPass
      },
      logger: false,
      clientInfo: {
        name: "Falcon Leads Agent",
        version: "1.0.0"
      },
      // Set a robust socket timeout
      connectionTimeout: 10000,
      greetingTimeout: 10000
    });

    await client.connect();

    const emailsList: any[] = [];
    const lock = await client.getMailboxLock("INBOX");

    try {
      // client.mailbox holds information about the currently open folder (INBOX)
      const mailboxInfo = client.mailbox as any;
      const existsCount = mailboxInfo && typeof mailboxInfo === "object" ? mailboxInfo.exists ?? 0 : 0;
      console.log(`Live IMAP Sync: INBOX contains ${existsCount} total messages.`);

      if (existsCount > 0) {
        // Fetch the latest N messages (sequence is 1-based, where existsCount is the newest message)
        const fetchLimit = Math.min(limit, existsCount);
        const startSeq = Math.max(1, existsCount - fetchLimit + 1);
        const endSeq = existsCount;
        const seqRange = `${startSeq}:${endSeq}`;

        console.log(`Live IMAP Sync: Fetching message sequence range: ${seqRange}`);

        // Fetch envelopes and raw source content
        const messages = client.fetch({ seq: seqRange }, { envelope: true, source: true });

        for await (const msg of messages) {
          try {
            if (!msg.source) continue;
            // Parse raw email source into clean subject, body text, and sender headers
            const parsed = (await simpleParser(msg.source)) as any;
            
            // Format sender display details
            const fromHeader = parsed.from?.value?.[0] || { address: connection.smtpUser, name: "Unknown Sender" };
            const leadName = fromHeader.name || fromHeader.address?.split("@")[0] || "Valued Client";
            const leadEmail = fromHeader.address || connection.smtpUser;

            emailsList.push({
              id: `rx_imap_${msg.uid ?? Math.random().toString(36).substring(2, 9)}`,
              leadName,
              leadEmail,
              subject: parsed.subject || "No Subject",
              body: typeof parsed.text === "string" ? parsed.text : typeof parsed.html === "string" ? parsed.html : "No body content found.",
              sentAt: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
              status: msg.flags?.has("\\Seen") ? "read" : "unread",
              replies: []
            });
          } catch (parseErr) {
            console.error("Live IMAP Sync: Failed to parse individual message parser:", parseErr);
          }
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();

    // Sort emails to return the absolute newest first in the list
    const sortedEmails = emailsList.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());

    console.log(`Live IMAP Sync: Successfully parsed ${sortedEmails.length} active inbox emails.`);

    return NextResponse.json({
      success: true,
      emails: sortedEmails
    });

  } catch (error) {
    console.error("Live IMAP Sync: Fatal IMAP sync connection failure:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "SMTP/IMAP server connection timed out or rejected auth."
    }, { status: 500 });
  }
}
