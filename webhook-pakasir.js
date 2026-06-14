const axios = require("axios");
const { kv } = require("@vercel/kv");

const PAKASIR_PROJECT = "velynabot";
const TELEGRAM_TOKEN  = "8726574684:AAGirxmR98He3_oRWubznWX1LlC_CpMOfIY";
const TELEGRAM_CHATID = "8347420543";

async function sendTelegramNotification(text) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHATID,
      text,
      parse_mode: "Markdown",
    });
  } catch (e) {
    console.error("Gagal mengirim Telegram:", e.message);
  }
}

async function processSewaLunas(orderId, trx) {
  const { link_grub: linkGc, premium_target: cleanPremUserStr, product_data: pData } = trx;

  trx.status = "PAID";
  trx.paid_at = Date.now();
  await kv.set(`trx:${orderId}`, JSON.stringify(trx), { ex: 86400 * 90 });

  const baseTime = Date.now();
  const sewaKey = `sewa:${linkGc}`;
  const existingSewa = await kv.get(sewaKey);
  let finalExpired = baseTime + pData.days * 86400000;
  if (existingSewa) {
    const parsed = typeof existingSewa === "string" ? JSON.parse(existingSewa) : existingSewa;
    if (parsed.expired > baseTime) finalExpired = parsed.expired + pData.days * 86400000;
  }
  await kv.set(sewaKey, JSON.stringify({ linkGrub: linkGc, expired: finalExpired }));

  let bonusText = "Tidak ada";
  if (pData.bonusPrem > 0 && cleanPremUserStr !== "none") {
    const targetNumbers = cleanPremUserStr.split(",").map(n => n.trim()).filter(Boolean);
    const validTargets = targetNumbers.slice(0, pData.bonusPrem);
    for (const targetUser of validTargets) {
      const userKey = `user:${targetUser}`;
      let userData = await kv.get(userKey);
      userData = userData ? (typeof userData === "string" ? JSON.parse(userData) : userData) : { money: 0, role: "user", status: "active", premium: null };
      let tglMulai = new Date();
      if (userData.premium && new Date(userData.premium) > tglMulai) tglMulai = new Date(userData.premium);
      const tanggalAkhirPrem = new Date(tglMulai.setDate(tglMulai.getDate() + 30));
      userData.premium = tanggalAkhirPrem.toISOString();
      userData.role = "premium";
      await kv.set(userKey, JSON.stringify(userData));
    }
    bonusText = `Sukses Aktif (${validTargets.length} User Premium Terdaftar)`;
  }

  const formattedDateEnd = new Date(finalExpired).toLocaleString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  }) + " WIB";

  await sendTelegramNotification(
    `📢 *TRANSAKSI SEWA/PERPANJANG MASUK* 📢\n\n` +
    `💰 *Status:* LUNAS (Pakasir Web)\n` +
    `🆔 *Order ID:* \`${orderId}\`\n` +
    `📦 *Jenis:* ${pData.type === "NEW" ? "Sewa Baru" : "Perpanjang"}\n` +
    `📋 *Paket:* ${pData.name}\n` +
    `🔗 *Link:* ${linkGc}\n` +
    `👤 *Pembeli:* \`${trx.sender.split("@")[0]}\`\n` +
    `🎁 *Bonus Premium:* ${bonusText}\n` +
    `💵 *Total:* *Rp ${trx.total_payment.toLocaleString("id-ID")}*\n` +
    `⏳ *Expired:* _${formattedDateEnd}_\n\n` +
    `⚙️ _Sistem otomatis memperbarui database sewa grup._`
  );
}

async function processPremiumLunas(orderId, trx) {
  const { premium_target: targetUser, product_data: pData } = trx;
  const userKey = `user:${targetUser}`;

  let userData = await kv.get(userKey);
  userData = userData ? (typeof userData === "string" ? JSON.parse(userData) : userData) : { money: 0, role: "user", status: "active", premium: null };

  const sekarang = new Date();
  let tanggalMulai = new Date();
  if (userData.premium && new Date(userData.premium) > sekarang) tanggalMulai = new Date(userData.premium);

  const tanggalAkhir = new Date(tanggalMulai.getTime() + pData.days * 86400000);
  userData.premium = tanggalAkhir.toISOString();
  userData.role = "premium";
  await kv.set(userKey, JSON.stringify(userData));

  trx.status = "PAID";
  trx.paid_at = Date.now();
  await kv.set(`trx:${orderId}`, JSON.stringify(trx), { ex: 86400 * 90 });

  const formattedDateEnd = tanggalAkhir.toLocaleString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  }) + " WIB";

  await sendTelegramNotification(
    `📢 *TRANSAKSI PREMIUM MASUK* 📢\n\n` +
    `💰 *Status:* LUNAS (Pakasir Web)\n` +
    `🆔 *Order ID:* \`${orderId}\`\n` +
    `📦 *Paket:* ${pData.name}\n` +
    `👤 *Target Nomor:* \`${targetUser.split("@")[0]}\`\n` +
    `💵 *Total:* *Rp ${trx.total_payment.toLocaleString("id-ID")}*\n` +
    `⏳ *Berlaku Sampai:* _${formattedDateEnd}_\n\n` +
    `⚙️ _Sistem otomatis mengubah role user menjadi premium._`
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ status: "error", message: "Method not allowed" });

  try {
    const { order_id, project, status } = req.body;
    if (project !== PAKASIR_PROJECT) return res.sendStatus(403);

    const raw = await kv.get(`trx:${order_id}`);
    if (!raw) return res.json({ status: "ignored" });

    const trx = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (trx.status === "PAID") return res.json({ status: "ignored" });

    if (status === "completed") {
      if (trx.type === "BUY_PREMIUM") await processPremiumLunas(order_id, trx);
      else await processSewaLunas(order_id, trx);
    }

    return res.json({ status: "ok" });
  } catch (error) {
    console.error(error);
    return res.status(500).send("Internal Server Error");
  }
};
