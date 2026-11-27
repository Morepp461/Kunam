import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const allowedOrigin = (origin: string) =>
  origin === "http://localhost:5173" ||
  origin === "https://calerismasters.com" ||
  origin === "https://www.calerismasters.com" ||
  origin === "https://calerismastersnewgen-mu.vercel.app" ||
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": allowedOrigin(origin) ? origin : "https://calerismasters.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
});

function createServiceClient(url: string, key: string) {
  const isSecretApiKey = key.startsWith("sb_secret_");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(isSecretApiKey ? {
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const request = new Request(input, init);
          const headers = new Headers(request.headers);
          headers.delete("Authorization");
          headers.set("apikey", key);
          return fetch(new Request(request, { headers }));
        },
      },
    } : {}),
  });
}

async function sha512Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-512", bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function basicAuth(serverKey: string) {
  return "Basic " + btoa(serverKey + ":");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  const headers = corsHeaders(origin);
  const respond = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers });

  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return respond(405, { error: "Method not allowed." });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
    const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const publishableKey = publishableKeys ? JSON.parse(publishableKeys).default : anonKey;
    const serviceKey = serviceRoleKey || (secretKeys ? JSON.parse(secretKeys).default : null);
    if (!supabaseUrl || !publishableKey || !serviceKey) {
      return respond(500, { error: "Shop payment service is not configured." });
    }

    const serviceClient = createServiceClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "create_order") {
      if (!allowedOrigin(origin)) return respond(403, { error: "Origin not allowed." });
      const authorization = req.headers.get("Authorization") ?? "";
      const jwt = authorization.replace(/^Bearer\s+/i, "");
      if (!jwt) return respond(401, { error: "Authentication required." });

      const authClient = createClient(supabaseUrl, publishableKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: "Bearer " + jwt } },
      });
      const { data: authData, error: authError } = await authClient.auth.getUser(jwt);
      if (authError || !authData.user) return respond(401, { error: "Invalid or expired session." });

      const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY");
      const signatureSecretKey = Deno.env.get("MIDTRANS_SIGNATURE_KEY");
      const clientKey = Deno.env.get("MIDTRANS_CLIENT_KEY");
      const isProduction = Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true";
      if (!serverKey || !signatureSecretKey || !clientKey) {
        return respond(503, { error: "Pembayaran belum diaktifkan. Konfigurasi merchant dan verifikasi Sandbox masih diperlukan." });
      }

      const teamId = typeof body.team_id === "string" ? body.team_id : "";
      const requestKey = typeof body.request_key === "string" ? body.request_key : "";
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(teamId) || !uuidPattern.test(requestKey)) {
        return respond(400, { error: "Checkout request tidak valid." });
      }

      const { data: prepared, error: prepareError } = await serviceClient.rpc("caleris_midtrans_prepare_order", {
        p_user_id: authData.user.id,
        p_team_id: teamId,
        p_request_key: requestKey,
      });
      if (prepareError) {
        console.error("Midtrans order preparation failed:", prepareError.message);
        return respond(409, { error: prepareError.message });
      }
      if (prepared?.status === "already_owned") return respond(200, { status: "already_owned" });
      if (prepared?.status === "paid") return respond(200, { status: "paid", order_id: prepared.order_id });
      if (prepared?.status === "pending_exists" && prepared.snap_token) {
        return respond(200, {
          status: "pending", order_id: prepared.order_id, snap_token: prepared.snap_token,
          redirect_url: prepared.redirect_url, client_key: clientKey,
          snap_script_url: isProduction ? "https://app.midtrans.com/snap/snap.js" : "https://app.sandbox.midtrans.com/snap/snap.js",
        });
      }
      if (prepared?.status !== "created") {
        return respond(409, { error: "Masih ada transaksi pembayaran yang belum selesai. Selesaikan atau tunggu masa berlakunya berakhir." });
      }

      const snapBase = isProduction ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com";
      const amount = Number(prepared.amount_idr);
      const snapPayload = {
        transaction_details: { order_id: prepared.order_id, gross_amount: amount },
        item_details: [{
          id: "team_hq_project_slot_plus_one", price: amount, quantity: 1,
          name: "Additional HQ Project Slot",
        }],
        customer_details: {
          first_name: String(prepared.buyer_name || "CALERIS Member").slice(0, 40),
          email: authData.user.email || undefined,
        },
        callbacks: { finish: origin + "/shop?payment=processing" },
        credit_card: { secure: true },
      };

      const snapResponse = await fetch(snapBase + "/snap/v1/transactions", {
        method: "POST",
        headers: {
          Authorization: basicAuth(serverKey),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(snapPayload),
      });
      const snapData = await snapResponse.json().catch(() => ({}));
      if (!snapResponse.ok || typeof snapData.token !== "string" || typeof snapData.redirect_url !== "string") {
        await serviceClient.from("caleris_midtrans_shop_payments")
          .update({ status: "failed", provider_payload: { http_status: snapResponse.status, error_messages: snapData.error_messages ?? [] }, updated_at: new Date().toISOString() })
          .eq("order_id", prepared.order_id).eq("status", "created");
        console.error("Midtrans Snap token request failed:", snapResponse.status);
        return respond(502, { error: "Midtrans belum dapat membuat sesi pembayaran. Silakan coba lagi nanti." });
      }

      const { error: storeError } = await serviceClient.rpc("caleris_midtrans_store_snap_order", {
        p_order_id: prepared.order_id,
        p_snap_token: snapData.token,
        p_redirect_url: snapData.redirect_url,
      });
      if (storeError) {
        console.error("Midtrans Snap token storage failed:", storeError.message);
        return respond(500, { error: "Sesi pembayaran tidak dapat disimpan dengan aman." });
      }

      return respond(201, {
        status: "created",
        order_id: prepared.order_id,
        snap_token: snapData.token,
        redirect_url: snapData.redirect_url,
        client_key: clientKey,
        snap_script_url: isProduction ? "https://app.midtrans.com/snap/snap.js" : "https://app.sandbox.midtrans.com/snap/snap.js",
      });
    }

    const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY");
    const signatureSecretKey = Deno.env.get("MIDTRANS_SIGNATURE_KEY");
    const isProduction = Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true";
    if (!serverKey || !signatureSecretKey) {
      return respond(503, { error: "Notification verification is not configured." });
    }

    const orderId = typeof body.order_id === "string" ? body.order_id : "";
    const statusCode = typeof body.status_code === "string" ? body.status_code : "";
    const grossAmount = typeof body.gross_amount === "string" ? body.gross_amount : "";
    const signature = typeof body.signature_key === "string" ? body.signature_key.toLowerCase() : "";
    if (!orderId || !statusCode || !grossAmount || !signature) {
      return respond(400, { error: "Invalid notification payload." });
    }

    const expectedSignature = await sha512Hex(orderId + statusCode + grossAmount + signatureSecretKey);
    if (!constantTimeEqual(expectedSignature, signature)) {
      console.warn("Rejected Midtrans notification with invalid signature.");
      return respond(401, { error: "Invalid notification signature." });
    }

    const statusBase = isProduction ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
    const statusResponse = await fetch(statusBase + "/v2/" + encodeURIComponent(orderId) + "/status", {
      method: "GET",
      headers: { Authorization: basicAuth(serverKey), Accept: "application/json" },
    });
    const statusData = await statusResponse.json().catch(() => ({}));
    if (!statusResponse.ok) {
      console.error("Midtrans status verification failed:", statusResponse.status);
      return respond(502, { error: "Unable to verify transaction status with Midtrans." });
    }
    if (statusData.order_id !== orderId || statusData.currency !== "IDR") {
      return respond(400, { error: "Transaction identity or currency mismatch." });
    }

    const grossAmountNumber = Number(statusData.gross_amount);
    if (!Number.isFinite(grossAmountNumber)) return respond(400, { error: "Invalid transaction amount." });

    const safePayload = {
      order_id: orderId,
      status_code: String(statusData.status_code ?? statusCode),
      gross_amount: String(statusData.gross_amount),
      currency: statusData.currency,
      transaction_status: String(statusData.transaction_status ?? ""),
      fraud_status: statusData.fraud_status == null ? null : String(statusData.fraud_status),
      payment_type: statusData.payment_type == null ? null : String(statusData.payment_type),
      transaction_id: statusData.transaction_id == null ? null : String(statusData.transaction_id),
    };

    const { data: finalized, error: finalizeError } = await serviceClient.rpc("caleris_midtrans_finalize_order", {
      p_order_id: orderId,
      p_transaction_status: String(statusData.transaction_status ?? "").toLowerCase(),
      p_gross_amount: grossAmountNumber,
      p_status_code: String(statusData.status_code ?? statusCode),
      p_fraud_status: statusData.fraud_status == null ? null : String(statusData.fraud_status),
      p_payment_type: statusData.payment_type == null ? null : String(statusData.payment_type),
      p_provider_transaction_id: statusData.transaction_id == null ? null : String(statusData.transaction_id),
      p_payload: safePayload,
    });
    if (finalizeError) {
      console.error("Midtrans payment finalization failed:", finalizeError.message);
      return respond(500, { error: "Verified payment could not be finalized." });
    }
    return respond(200, { received: true, status: finalized?.status ?? "processed" });
  } catch (error) {
    console.error("Midtrans HQ Shop error:", error instanceof Error ? error.message : "Unknown error");
    return respond(500, { error: "Internal payment service error." });
  }
});
