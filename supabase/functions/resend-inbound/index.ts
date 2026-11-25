import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { Webhook } from "npm:svix@1.81.0";

type ResendReceivedEvent = { type?: string; created_at?: string; data?: { email_id?: string; from?: string; to?: string[] | string; subject?: string } };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const secretSet = Deno.env.get("SUPABASE_SECRET_KEYS");
  let secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (secretSet) { try { secret = JSON.parse(secretSet).default || secret; } catch { /* legacy fallback */ } }
  if (!url || !secret) throw new Error("Supabase server credentials are not configured.");
  return createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
}
function parseSender(value: string) {
  const match = value.match(/^(.*?)\s*<([^<>]+)>$/);
  return match ? { name: match[1].replace(/^["']|["']$/g, "").trim() || null, email: match[2].trim().toLowerCase() } : { name: null, email: value.trim().toLowerCase() };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!webhookSecret || !resendApiKey) return json({ error: "Inbound email integration is not configured." }, 503);
  let event: ResendReceivedEvent;
  try {
    const webhook = new Webhook(webhookSecret);
    event = webhook.verify(await req.text(), {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    }) as ResendReceivedEvent;
  } catch { return json({ error: "Invalid webhook signature." }, 401); }
  if (event.type !== "email.received") return json({ received: true, ignored: true });
  const emailId = event.data?.email_id;
  if (!emailId) return json({ error: "Missing received email ID." }, 400);
  const values = Array.isArray(event.data?.to) ? event.data!.to! : [event.data?.to ?? ""];
  const recipients = values.map((value) => String(value).toLowerCase());
  if (!recipients.some((value) => value.includes("support@calerismasters.com"))) return json({ received: true, ignored: true });
  const db = serviceClient();
  const { data: existing, error: existingError } = await db.from("support_messages").select("id").eq("provider_email_id", emailId).maybeSingle();
  if (existingError) return json({ error: "Unable to check message idempotency." }, 500);
  if (existing) return json({ received: true, duplicate: true });
  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, { headers: { Authorization: `Bearer ${resendApiKey}` } });
  if (!response.ok) { console.error("Resend inbound lookup failed:", response.status, await response.text()); return json({ error: "Unable to retrieve received email content." }, 502); }
  const detail = await response.json();
  const sender = parseSender(String(detail.from ?? event.data?.from ?? ""));
  const recipient = recipients.find((value) => value.includes("support@calerismasters.com")) ?? "support@calerismasters.com";
  const subject = String(detail.subject ?? event.data?.subject ?? "(No subject)").slice(0, 998);
  const attachments = Array.isArray(detail.attachments) ? detail.attachments.map((item: Record<string, unknown>) => ({ id: item.id ?? null, filename: item.filename ?? null, content_type: item.content_type ?? null, size: item.size ?? null })) : [];
  const { data: ticket, error: ticketError } = await db.from("support_tickets").insert({ sender_email: sender.email, sender_name: sender.name, recipient_email: recipient, subject, status: "open", priority: "normal", last_message_at: new Date().toISOString() }).select("id").single();
  if (ticketError || !ticket) { console.error("Ticket insert failed:", ticketError); return json({ error: "Unable to create support ticket." }, 500); }
  const { error: messageError } = await db.from("support_messages").insert({ ticket_id: ticket.id, direction: "inbound", sender_email: sender.email, recipient_email: recipient, subject, body_text: typeof detail.text === "string" ? detail.text : null, body_html: typeof detail.html === "string" ? detail.html : null, attachments, provider: "resend", provider_email_id: emailId, provider_message_id: detail.message_id ?? null, metadata: { received_at: event.created_at ?? null, headers: detail.headers ?? null } });
  if (messageError) { console.error("Message insert failed:", messageError); await db.from("support_tickets").delete().eq("id", ticket.id); return json({ error: "Unable to save support message." }, 500); }
  return json({ received: true, ticket_id: ticket.id });
});
