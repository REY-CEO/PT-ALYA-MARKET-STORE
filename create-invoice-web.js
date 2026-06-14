const axios = require("axios");
const { kv } = require("@vercel/kv");

const PAKASIR_CONFIG = {
  project: "velynabot",
  apikey: "2h9Uc1bZ5iP7EuLZj9eeD6j3grWwhWX1",
};

const SEWA_PACKAGES = {
  1:  { name: "Sewa Bot 30 Hari",   days: 30,  price: 12000, type: "NEW",     bonusPrem: 1 },
  2:  { name: "Sewa Bot 60 Hari",   days: 60,  price: 20000, type: "NEW",     bonusPrem: 2 },
  3:  { name: "Sewa Bot 90 Hari",   days: 90,  price: 30000, type: "NEW",     bonusPrem: 3 },
  4:  { name: "Sewa Bot 120 Hari",  days: 120, price: 40000, type: "NEW",     bonusPrem: 4 },
  5:  { name: "Sewa Bot 150 Hari",  days: 150, price: 50000, type: "NEW",     bonusPrem: 5 },
  6:  { name: "Sewa Bot 180 Hari",  days: 180, price: 60000, type: "NEW",     bonusPrem: 6 },
  11: { name: "Perpanjang Sewa 30 Hari",  days: 30,  price: 12000, type: "RENEW", bonusPrem: 0 },
  12: { name: "Perpanjang Sewa 60 Hari",  days: 60,  price: 20000, type: "RENEW", bonusPrem: 0 },
  13: { name: "Perpanjang Sewa 90 Hari",  days: 90,  price: 30000, type: "RENEW", bonusPrem: 0 },
  14: { name: "Perpanjang Sewa 120 Hari", days: 120, price: 40000, type: "RENEW", bonusPrem: 0 },
  15: { name: "Perpanjang Sewa 150 Hari", days: 150, price: 50000, type: "RENEW", bonusPrem: 0 },
  16: { name: "Perpanjang Sewa 180 Hari", days: 180, price: 60000, type: "RENEW", bonusPrem: 0 },
  "new_1":  { name: "Premium 1 Hari",   days: 1,   price: 1000,   type: "PREMIUM", bonusPrem: 0 },
  "new_2":  { name: "Premium 3 Hari",   days: 3,   price: 3000,   type: "PREMIUM", bonusPrem: 0 },
  "new_3":  { name: "Premium 5 Hari",   days: 5,   price: 5000,   type: "PREMIUM", bonusPrem: 0 },
  "new_4":  { name: "Premium 8 Hari",   days: 8,   price: 8000,   type: "PREMIUM", bonusPrem: 0 },
  "new_5":  { name: "Premium 1 Month",  days: 30,  price: 10000,  type: "PREMIUM", bonusPrem: 0 },
  "new_6":  { name: "Premium 2 Month",  days: 60,  price: 20000,  type: "PREMIUM", bonusPrem: 0 },
  "new_7":  { name: "Premium 3 Month",  days: 90,  price: 30000,  type: "PREMIUM", bonusPrem: 0 },
  "new_8":  { name: "Premium 4 Month",  days: 120, price: 40000,  type: "PREMIUM", bonusPrem: 0 },
  "new_9":  { name: "Premium 5 Month",  days: 150, price: 50000,  type: "PREMIUM", bonusPrem: 0 },
  "new_10": { name: "Premium 6 Month",  days: 180, price: 60000,  type: "PREMIUM", bonusPrem: 0 },
  "new_11": { name: "Premium 7 Month",  days: 210, price: 70000,  type: "PREMIUM", bonusPrem: 0 },
  "new_12": { name: "Premium 8 Month",  days: 240, price: 80000,  type: "PREMIUM", bonusPrem: 0 },
  "new_13": { name: "Premium 9 Month",  days: 270, price: 90000,  type: "PREMIUM", bonusPrem: 0 },
  "new_14": { name: "Premium 10 Month", days: 300, price: 100000, type: "PREMIUM", bonusPrem: 0 },
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ status: "error", message: "Method not allowed" });

  try {
    const { packageId, type, groupLink, targetNumber } = req.body;
    const paketSelected = SEWA_PACKAGES[packageId];
    if (!paketSelected) return res.status(400).json({ status: "error", message: "Paket tidak valid." });

    const orderId = "ALYABOT-" + Date.now();
    const responsePakasir = await axios.post("https://app.pakasir.com/api/transactioncreate/qris", {
      project: PAKASIR_CONFIG.project,
      order_id: orderId,
      amount: paketSelected.price,
      api_key: PAKASIR_CONFIG.apikey,
    });

    const paymentData = responsePakasir.data?.payment;
    if (!paymentData) return res.status(500).json({ status: "error", message: "Gagal membuat invoice Pakasir." });

    let cleanSender = targetNumber.replace(/[^0-9]/g, "");
    if (cleanSender.startsWith("0")) cleanSender = "62" + cleanSender.slice(1);
    if (!cleanSender.endsWith("@s.whatsapp.net")) cleanSender += "@s.whatsapp.net";

    const trxData = {
      sender: cleanSender,
      chat: cleanSender,
      type: type === "PREMIUM" ? "BUY_PREMIUM" : "SEWA_BOT",
      amount: paketSelected.price,
      fee_admin: paymentData.fee,
      total_payment: paymentData.total_payment,
      status: "UNPAID",
      expired_at: paymentData.expired_at,
      link_grub: type === "NEW" ? groupLink : "none",
      premium_target: cleanSender,
      product_data: paketSelected,
    };

    await kv.set(`trx:${orderId}`, JSON.stringify(trxData), { ex: 86400 });

    return res.json({
      status: "success",
      orderId,
      qrisImageUrl: `https://app.pakasir.com/pay/${PAKASIR_CONFIG.project}/${paymentData.total_payment}?order_id=${orderId}&qris_only=1`,
    });
  } catch (error) {
    return res.status(500).json({ status: "error", message: error.message });
  }
};
