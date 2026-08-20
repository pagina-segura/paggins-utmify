const express = require("express");

const app = express();
app.use(express.json({ limit: "256kb" }));

const UTMIFY_ENDPOINT = "https://api.utmify.com.br/api-credentials/orders";

function asText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function toCents(value) {
  const raw = asText(value);
  if (!raw) return 0;

  // Handles values like 197, 197.00, 197,00, 1,234.56
  let normalized = raw.replace(/[^\d,.-]/g, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/,/g, "");
  } else if (normalized.includes(",") && !normalized.includes(".")) {
    normalized = normalized.replace(",", ".");
  }

  const number = Number(normalized);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100);
}

function toUtcDate(value) {
  const raw = asText(value);
  const date = raw ? new Date(raw) : new Date();

  if (Number.isNaN(date.getTime())) {
    return formatUtc(new Date());
  }
  return formatUtc(date);
}

function formatUtc(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function mapStatus(value) {
  const status = asText(value).toLowerCase();

  if (["paid", "approved", "complete", "completed", "success", "succeeded"].includes(status)) {
    return "paid";
  }
  if (["refunded", "refund", "reimbursed"].includes(status)) {
    return "refunded";
  }
  if (["chargeback", "chargedback"].includes(status)) {
    return "chargedback";
  }
  if (["refused", "declined", "failed", "canceled", "cancelled"].includes(status)) {
    return "refused";
  }
  return "waiting_payment";
}

async function handlePaggins(req, res) {
  try {
    const token = process.env.UTMIFY_API_TOKEN;
    if (!token) {
      console.error("UTMIFY_API_TOKEN is missing");
      return res.status(500).json({ ok: false, error: "UTMIFY_API_TOKEN missing" });
    }

    const q = { ...req.query, ...(req.body || {}) };

    const orderId = asText(q.order_id);
    const orderStatus = mapStatus(q.order_status);
    const createdAt = toUtcDate(q.order_date);

    if (!orderId) {
      return res.status(400).json({ ok: false, error: "order_id missing" });
    }

    const totalPriceInCents = toCents(q.total_price || q.amount_gross);
    const grossInCents = toCents(q.amount_gross || q.total_price);
    const netInCents = toCents(q.amount_net || q.amount_gross || q.total_price);
    const gatewayFeeInCents = Math.max(0, grossInCents - netInCents);

    const quantityRaw = parseInt(asText(q.quantity), 10);
    const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1;

    const nowUtc = formatUtc(new Date());

    const payload = {
      orderId,
      platform: "Paggins",
      paymentMethod: "credit_card",
      status: orderStatus,
      createdAt,
      approvedDate: orderStatus === "paid" ? createdAt : null,
      refundedAt: orderStatus === "refunded" ? nowUtc : null,
      customer: {
        name: asText(q.customer_name) || "Customer",
        email: asText(q.customer_email) || "unknown@example.com",
        phone: asText(q.customer_phone) || null,
        document: null
      },
      products: [
        {
          id: asText(q.product_id) || "paggins-product",
          name: asText(q.product_name) || "Paggins Product",
          planId: null,
          planName: null,
          quantity,
          priceInCents: totalPriceInCents
        }
      ],
      trackingParameters: {
        src: asText(q.cid) || null,
        sck: null,
        utm_source: null,
        utm_campaign: null,
        utm_medium: null,
        utm_content: null,
        utm_term: null
      },
      commission: {
        totalPriceInCents,
        gatewayFeeInCents,
        userCommissionInCents: netInCents || totalPriceInCents,
        currency: ["BRL", "USD", "EUR", "GBP", "ARS", "CAD"].includes(asText(q.currency).toUpperCase())
          ? asText(q.currency).toUpperCase()
          : "USD"
      },
      isTest: false
    };

    const response = await fetch(UTMIFY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-token": token
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();

    console.log("Paggins -> UTMify", {
      orderId,
      status: orderStatus,
      utmifyStatus: response.status
    });

    if (!response.ok) {
      console.error("UTMify error:", response.status, responseText);
      return res.status(502).json({
        ok: false,
        error: "UTMify rejected the order",
        status: response.status
      });
    }

    return res.status(200).json({ ok: true, orderId });
  } catch (error) {
    console.error("Bridge error:", error);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}

app.get("/", (req, res) => {
  res.status(200).send("Paggins -> UTMify bridge online");
});

app.get("/paggins", handlePaggins);
app.post("/paggins", handlePaggins);
app.get("/api/paggins-utmfy", handlePaggins);
app.post("/api/paggins-utmfy", handlePaggins);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Bridge running on port ${port}`);
});