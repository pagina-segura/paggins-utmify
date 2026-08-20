const express = require("express");

const app = express();
app.use(express.json({ limit: "256kb" }));

const UTMIFY_ENDPOINT = "https://api.utmify.com.br/api-credentials/orders";

function str(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function moneyToCents(value) {
  let raw = str(value);
  if (!raw) return 0;

  raw = raw.replace(/[^\d,.-]/g, "");

  if (raw.includes(",") && raw.includes(".")) {
    raw = raw.replace(/,/g, "");
  } else if (raw.includes(",")) {
    raw = raw.replace(",", ".");
  }

  const amount = Number(raw);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function utc(value) {
  let d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) d = new Date();

  const pad = (n) => String(n).padStart(2, "0");

  return (
    d.getUTCFullYear() + "-" +
    pad(d.getUTCMonth() + 1) + "-" +
    pad(d.getUTCDate()) + " " +
    pad(d.getUTCHours()) + ":" +
    pad(d.getUTCMinutes()) + ":" +
    pad(d.getUTCSeconds())
  );
}

function normalizeStatus(value) {
  const s = str(value).toLowerCase().trim();

  const paid = [
    "paid", "pago", "approved", "aprovado",
    "processed", "processado", "completed", "complete",
    "success", "succeeded"
  ];

  const refunded = [
    "refunded", "refund", "reembolsado", "reembolso",
    "reimbursed"
  ];

  const chargeback = [
    "chargeback", "chargedback", "charged_back"
  ];

  const refused = [
    "refused", "declined", "recusado", "failed",
    "erro no pagamento", "payment_error",
    "canceled", "cancelled", "cancelado"
  ];

  if (paid.includes(s)) return "paid";
  if (refunded.includes(s)) return "refunded";
  if (chargeback.includes(s)) return "chargedback";
  if (refused.includes(s)) return "refused";

  return "waiting_payment";
}

async function handler(req, res) {
  try {
    const token = process.env.UTMIFY_API_TOKEN;

    if (!token) {
      console.error("UTMIFY_API_TOKEN missing");
      return res.status(500).json({ ok: false, error: "UTMIFY_API_TOKEN missing" });
    }

    const data = { ...req.query, ...(req.body || {}) };

    const orderId = str(data.order_id);
    const rawStatus = str(data.order_status);
    const mappedStatus = normalizeStatus(rawStatus);
    const cid = str(data.cid);

    // Evita considerar como pedido um teste contendo macro literal.
    if (!orderId || orderId === "{order_id}") {
      console.error("Invalid order_id received:", orderId);
      return res.status(400).json({ ok: false, error: "invalid order_id" });
    }

    const createdAt = utc(data.order_date);

    const totalCents = moneyToCents(data.total_price || data.amount_gross);
    const grossCents = moneyToCents(data.amount_gross || data.total_price);
    const netCents = moneyToCents(data.amount_net || data.amount_gross || data.total_price);
    const feeCents = Math.max(0, grossCents - netCents);

    let quantity = parseInt(str(data.quantity), 10);
    if (!Number.isFinite(quantity) || quantity < 1) quantity = 1;

    const currencyRaw = str(data.currency).toUpperCase();
    const acceptedCurrencies = ["BRL", "USD", "EUR", "GBP", "ARS", "CAD"];
    const currency = acceptedCurrencies.includes(currencyRaw) ? currencyRaw : "USD";

    const payload = {
      orderId,
      platform: "Paggins",
      paymentMethod: "credit_card",
      status: mappedStatus,
      createdAt,
      approvedDate: mappedStatus === "paid" ? createdAt : null,
      refundedAt: mappedStatus === "refunded" ? utc() : null,

      customer: {
        name: str(data.customer_name) || "Customer",
        email: str(data.customer_email) || "unknown@example.com",
        phone: str(data.customer_phone) || null,
        document: null
      },

      products: [
        {
          id: str(data.product_id) || "paggins-product",
          name: str(data.product_name) || "Paggins Product",
          planId: null,
          planName: null,
          quantity,
          priceInCents: totalCents
        }
      ],

      // IMPORTANTE:
      // Na VSL, o CID da Paggins recebe uma cópia do SCK da UTMify.
      // Aqui devolvemos esse mesmo valor como SCK para a UTMify.
      trackingParameters: {
        src: null,
        sck: cid || null,
        utm_source: null,
        utm_campaign: null,
        utm_medium: null,
        utm_content: null,
        utm_term: null
      },

      commission: {
        totalPriceInCents: totalCents,
        gatewayFeeInCents: feeCents,
        userCommissionInCents: netCents || totalCents,
        currency
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
      rawStatus,
      mappedStatus,
      hasCid: Boolean(cid),
      utmifyStatus: response.status
    });

    if (!response.ok) {
      console.error("UTMify rejected order:", response.status, responseText);
      return res.status(502).json({
        ok: false,
        error: "UTMify rejected order",
        status: response.status
      });
    }

    return res.status(200).json({
      ok: true,
      orderId,
      status: mappedStatus,
      tracked: Boolean(cid)
    });
  } catch (error) {
    console.error("Bridge error:", error);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}

app.get("/", (req, res) => {
  res.status(200).send("Paggins -> UTMify bridge v2 online");
});

app.get("/paggins", handler);
app.post("/paggins", handler);

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Bridge v2 running on port ${port}`);
});