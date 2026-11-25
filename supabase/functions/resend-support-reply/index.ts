import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://calerismasters.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const publishable = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const secretSet = Deno.env.get("SUPABASE_SECRET_KEYS");
    const legacyService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const apiKey = publishable ? JSON.parse(publishable).default : anon;
    const serviceKey = legacyService || (secretSet ? JSON.parse(secretSet).default : null);
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!url || !apiKey || !serviceKey || !resendKey || !jwt) return json({ error: "Support reply service is not configured." }, 503);
    const auth = createClient(url, apiKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await auth.auth.getUser(jwt);
    if (authError || !authData.user) return json({ error: "Authentication required." }, 401);
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: adminRow, error: adminError } = await admin.from("site_admins").select("user_id").eq("user_id", authData.user.id).maybeSingle();
    if (adminError || !adminRow) return json({ error: "Administrator access required." }, 403);
    const body = await req.json();
    const ticketId = typeof body.ticketId === "string" ? body.ticketId : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!ticketId || message.length < 2 || message.length > 10000) return json({ error: "Invalid ticket or reply message." }, 400);
    const { data: ticket, error: ticketError } = await admin.from("support_tickets").select("id,sender_email,subject").eq("id", ticketId).single();
    if (ticketError || !ticket) return json({ error: "Ticket not found." }, 404);
    const subject = ticket.subject.toLowerCase().startsWith("re:") ? ticket.subject : "Re: " + ticket.subject;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + resendKey, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CALERIS Support <support@calerismasters.com>", to: [ticket.sender_email], subject, text: message }),
    });
    const result = await response.json();
    if (!response.ok) { console.error("Resend send failed:", response.status, result); return json({ error: "Resend failed to send the reply." }, 502); }
    const { error: insertError } = await admin.from("support_messages").insert({
      ticket_id: ticket.id, direction: "outbound", sender_email: "support@calerismasters.com",
      recipient_email: ticket.sender_email, subject, body_text: message, provider: "resend",
      provider_message_id: result.id ?? null, metadata: { resend_response: result },
    });
    if (insertError) { console.error("Reply sent but transcript insert failed:", insertError); return json({ error: "Email was sent, but saving the conversation failed. Contact support before retrying." }, 500); }
    return json({ sent: true, message_id: result.id ?? null });
  } catch (error) {
    console.error("Support reply error:", error);
    return json({ error: "Unexpected support reply error." }, 500);
  }
});
