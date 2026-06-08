// The Dessert Bar — Telegram Bot
// Handles both personal chat and group purchasing management

const https = require('https');

const BOT_TOKEN = '8787023077:AAFTmxyyOIBv3DK8V3Pes7FdTQx8cU_5oJY';
const OWNER_CHAT_ID = '986676229';
const GROUP_CHAT_ID = '-1004290700890';
const SB_URL = 'ivhcimcudidwpnwmfvbd.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2aGNpbWN1ZGlkd3Bud21mdmJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTI0NTYsImV4cCI6MjA5NTg4ODQ1Nn0.0_rcL5LT0tpei47cIKgqPFfDivylvvP6jbUEgbzXFLE';

// ── Weekly purchase schedule (from your Db_Weekly_inventory.docx) ──
const WEEKLY_SCHEDULE = {
  0: { day: 'Sunday',    items: ['Eggs', 'Chicken', 'Mozzarella Cheese'] },
  1: { day: 'Monday',    items: ['Chocolate', 'Tea Bags', 'Yo Creme'] },
  2: { day: 'Tuesday',   items: ['KOJJ Flour', 'Creme Cheese', 'Coffee', 'Mercato Items (Bilen)'] },
  3: { day: 'Wednesday', items: ['Butter', 'Oil', 'Sugar Stick', 'Cacao Powder'] },
  4: { day: 'Thursday',  items: ['Sugar', 'Staff Meal Vegetables', 'Beef'] },
  5: { day: 'Friday',    items: ['Vegetables & Fruits', 'Smoked Salmon', 'Normal Salmon', 'Sausage'] },
  6: { day: 'Saturday',  items: ['Water (Gold Water)', 'Sprite & Ambo Water'] },
};

// ── HTTP helper ───────────────────────────────────────────────────
function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Telegram helpers ──────────────────────────────────────────────
async function send(chatId, text, extra = {}) {
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra });
  return request({
    hostname: 'api.telegram.org',
    path: `/bot${BOT_TOKEN}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, body);
}

async function getUpdates(offset) {
  return request({
    hostname: 'api.telegram.org',
    path: `/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=30`,
    method: 'GET'
  });
}

// ── Supabase helpers ──────────────────────────────────────────────
async function dbGet(path) {
  return request({
    hostname: SB_URL,
    path: `/rest/v1/${path}`,
    method: 'GET',
    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }
  });
}

async function dbPost(path, body) {
  const data = JSON.stringify(body);
  return request({
    hostname: SB_URL,
    path: `/rest/v1/${path}`,
    method: 'POST',
    headers: {
      'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'return=representation',
      'Content-Length': Buffer.byteLength(data)
    }
  }, data);
}

async function dbPatch(path, body) {
  const data = JSON.stringify(body);
  return request({
    hostname: SB_URL,
    path: `/rest/v1/${path}`,
    method: 'PATCH',
    headers: {
      'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'return=representation',
      'Content-Length': Buffer.byteLength(data)
    }
  }, data);
}

// ── Date helpers ──────────────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0]; }
function yesterday() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
function weekAgo() {
  const d = new Date(); d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
}
function dayOfWeek() { return new Date().getDay(); }

// ── Sales helpers ─────────────────────────────────────────────────
async function getSalesSummary(date) {
  const sales = await dbGet(`sales?sale_date=eq.${date}&select=qty,revenue,item_name`);
  if (!Array.isArray(sales) || sales.length === 0) return null;
  const totalRev = sales.reduce((a, s) => a + parseFloat(s.revenue), 0);
  const totalQty = sales.reduce((a, s) => a + parseInt(s.qty), 0);
  const itemMap = {};
  sales.forEach(s => { itemMap[s.item_name] = (itemMap[s.item_name] || 0) + parseInt(s.qty); });
  const top = Object.entries(itemMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return { totalRev, totalQty, top, date };
}

async function getWeeklySummary() {
  const sales = await dbGet(`sales?sale_date=gte.${weekAgo()}&select=qty,revenue,item_name`);
  if (!Array.isArray(sales) || sales.length === 0) return null;
  const totalRev = sales.reduce((a, s) => a + parseFloat(s.revenue), 0);
  const totalQty = sales.reduce((a, s) => a + parseInt(s.qty), 0);
  const itemMap = {};
  sales.forEach(s => { itemMap[s.item_name] = (itemMap[s.item_name] || 0) + parseInt(s.qty); });
  const top = Object.entries(itemMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return { totalRev, totalQty, top };
}

async function getStockAlerts() {
  const ings = await dbGet('ingredients?order=name');
  if (!Array.isArray(ings)) return { low: [], out: [] };
  const out = ings.filter(i => parseFloat(i.qty) <= 0 && parseFloat(i.min_qty) > 0);
  const low = ings.filter(i => parseFloat(i.qty) > 0 && parseFloat(i.qty) <= parseFloat(i.min_qty) && parseFloat(i.min_qty) > 0);
  return { low, out };
}

// ── Purchase logging ──────────────────────────────────────────────
async function logPurchase(itemName, qty, unit, unitPrice, totalPrice, buyerName) {
  // Save to purchases table
  await dbPost('purchases', {
    purchase_date: today(),
    item_name: itemName,
    qty: parseFloat(qty),
    unit: unit,
    unit_price: parseFloat(unitPrice),
    total_price: parseFloat(totalPrice),
    buyer_name: buyerName
  });

  // Update stock if ingredient exists
  const ings = await dbGet(`ingredients?name=ilike.${encodeURIComponent(itemName)}`);
  if (Array.isArray(ings) && ings.length > 0) {
    const ing = ings[0];
    const newQty = parseFloat(ing.qty) + parseFloat(qty);
    await dbPatch(`ingredients?id=eq.${ing.id}`, { qty: newQty });
    return { stockUpdated: true, ingredient: ing.name, newQty, unit: ing.unit };
  }
  return { stockUpdated: false };
}

async function getPurchaseHistory(days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];
  return dbGet(`purchases?purchase_date=gte.${sinceStr}&order=purchase_date.desc,created_at.desc&limit=50`);
}

// ── Message formatters ────────────────────────────────────────────
function fmtSales(data, label) {
  if (!data) return `📊 No sales recorded for ${label}.`;
  const icons = ['🥇','🥈','🥉','4️⃣','5️⃣'];
  const topLines = data.top.map(([name, qty], i) => `  ${icons[i]} ${name} — ${qty} sold`).join('\n');
  return `☕ <b>The Dessert Bar</b>
📅 <b>${label}</b>

💰 Revenue: <b>${Math.round(data.totalRev).toLocaleString()} ETB</b>
🛒 Items sold: <b>${data.totalQty}</b>

🏆 <b>Top sellers:</b>
${topLines}`;
}

function fmtStock({ low, out }) {
  if (!low.length && !out.length) return '✅ <b>All stock levels are OK!</b>';
  let msg = '📦 <b>Stock Alerts</b>\n\n';
  if (out.length) {
    msg += '🔴 <b>OUT OF STOCK:</b>\n';
    out.forEach(i => { msg += `  • ${i.name}\n`; });
    msg += '\n';
  }
  if (low.length) {
    msg += '🟡 <b>RUNNING LOW:</b>\n';
    low.forEach(i => { msg += `  • ${i.name} — ${parseFloat(i.qty).toFixed(2)} ${i.unit} left\n`; });
  }
  return msg;
}

function fmtFullStock(ings) {
  if (!ings.length) return '📦 No ingredients in stock yet.';
  let msg = '📦 <b>Full Stock List</b>\n\n';
  ings.forEach(i => {
    const qty = parseFloat(i.qty);
    const min = parseFloat(i.min_qty);
    const icon = qty <= 0 ? '🔴' : (qty <= min && min > 0) ? '🟡' : '🟢';
    msg += `${icon} ${i.name}: <b>${qty.toFixed(2)} ${i.unit}</b>\n`;
  });
  return msg;
}

function fmtDailySchedule() {
  const dow = dayOfWeek();
  const schedule = WEEKLY_SCHEDULE[dow];
  const itemLines = schedule.items.map(i => `  • ${i}`).join('\n');
  return `🛒 <b>Today's Purchasing List — ${schedule.day}</b>

${itemLines}

To log a purchase, type:
<code>/bought [item] [qty] [unit] [unit price]</code>

Example:
<code>/bought Coffee 10 kg 2200</code>`;
}

// ── Command handler ───────────────────────────────────────────────
async function handleCommand(chatId, text, fromName, isGroup) {
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();

  // ── /help or /start ──
  if (cmd === '/start' || cmd === '/help') {
    if (isGroup) {
      await send(chatId, `☕ <b>Dessert Bar Stock Bot</b>

<b>Purchaser commands:</b>
/bought [item] [qty] [unit] [price] — Log a purchase
Example: <code>/bought Coffee 10 kg 2200</code>

/schedule — Today's purchasing list
/purchases — This week's purchases

<b>Management commands:</b>
/stock — Stock alerts
/sales — Yesterday's sales summary`);
    } else {
      await send(chatId, `☕ <b>Welcome to The Dessert Bar Bot!</b>

📊 <b>Sales:</b>
/today — Today's sales
/yesterday — Yesterday's summary
/weekly — This week's summary

📦 <b>Stock:</b>
/stock — Stock alerts
/fullstock — Complete stock list

🛒 <b>Purchases:</b>
/purchases — This week's purchase log
/schedule — Today's purchase list`);
    }

  // ── /schedule ──
  } else if (cmd === '/schedule') {
    await send(chatId, fmtDailySchedule());

  // ── /bought ──
  } else if (cmd === '/bought') {
    // Format: /bought Coffee 10 kg 2200
    // Or:     /bought Coffee 10kg 2200  (unit attached to qty)
    if (parts.length < 4) {
      await send(chatId, `❌ Wrong format. Use:
<code>/bought [item] [qty] [unit] [unit price]</code>
Example: <code>/bought Coffee 10 kg 2200</code>
Example: <code>/bought Milk 20 L 45</code>`);
      return;
    }

    // Parse flexibly
    let itemName, qty, unit, unitPrice;

    // Check if unit is attached to qty (e.g. "10kg")
    const qtyUnitMatch = parts[2].match(/^([\d.]+)([a-zA-Z]+)$/);
    if (qtyUnitMatch) {
      itemName = parts[1];
      qty = parseFloat(qtyUnitMatch[1]);
      unit = qtyUnitMatch[2];
      unitPrice = parseFloat(parts[3]);
    } else if (parts.length >= 5) {
      itemName = parts[1];
      qty = parseFloat(parts[2]);
      unit = parts[3];
      unitPrice = parseFloat(parts[4]);
    } else {
      itemName = parts[1];
      qty = parseFloat(parts[2]);
      unit = 'pcs';
      unitPrice = parseFloat(parts[3]);
    }

    const totalPrice = qty * unitPrice;

    if (isNaN(qty) || isNaN(unitPrice)) {
      await send(chatId, `❌ Could not parse numbers. Use:
<code>/bought Coffee 10 kg 2200</code>`);
      return;
    }

    const result = await logPurchase(itemName, qty, unit, unitPrice, totalPrice, fromName);

    let msg = `✅ <b>Purchase recorded by ${fromName}</b>

📦 Item: <b>${itemName}</b>
📏 Quantity: <b>${qty} ${unit}</b>
💵 Unit price: <b>${unitPrice.toLocaleString()} ETB/${unit}</b>
💰 Total paid: <b>${totalPrice.toLocaleString()} ETB</b>
📅 Date: ${today()}`;

    if (result.stockUpdated) {
      msg += `\n\n✅ Stock updated: ${result.ingredient} → <b>${result.newQty.toFixed(2)} ${result.unit}</b>`;
    } else {
      msg += `\n\n⚠️ Note: "${itemName}" not found in ingredients list — stock not updated automatically.`;
    }

    await send(chatId, msg);

  // ── /purchases ──
  } else if (cmd === '/purchases') {
    const purchases = await getPurchaseHistory(7);
    if (!Array.isArray(purchases) || purchases.length === 0) {
      await send(chatId, '🛒 No purchases recorded this week yet.');
      return;
    }
    let total = 0;
    let msg = '🛒 <b>Purchase Log — Last 7 Days</b>\n\n';
    purchases.forEach(p => {
      total += parseFloat(p.total_price || 0);
      msg += `• <b>${p.item_name}</b> — ${p.qty} ${p.unit} @ ${parseFloat(p.unit_price).toLocaleString()} ETB\n`;
      msg += `  Total: ${parseFloat(p.total_price).toLocaleString()} ETB | ${p.purchase_date} | ${p.buyer_name}\n\n`;
    });
    msg += `💰 <b>Total spent: ${total.toLocaleString()} ETB</b>`;
    await send(chatId, msg);

  // ── /stock ──
  } else if (cmd === '/stock' || cmd === '/low') {
    const alerts = await getStockAlerts();
    await send(chatId, fmtStock(alerts));

  // ── /fullstock (personal only) ──
  } else if (cmd === '/fullstock') {
    const ings = await dbGet('ingredients?order=name');
    await send(chatId, fmtFullStock(Array.isArray(ings) ? ings : []));

  // ── /today ──
  } else if (cmd === '/today') {
    const data = await getSalesSummary(today());
    await send(chatId, fmtSales(data, `Today (${today()})`));

  // ── /yesterday or /sales ──
  } else if (cmd === '/yesterday' || cmd === '/sales') {
    const data = await getSalesSummary(yesterday());
    await send(chatId, fmtSales(data, `Yesterday (${yesterday()})`));

  // ── /weekly ──
  } else if (cmd === '/weekly') {
    const data = await getWeeklySummary();
    if (!data) { await send(chatId, '📊 No sales data this week yet.'); return; }
    const icons = ['🥇','🥈','🥉','4️⃣','5️⃣'];
    const topLines = data.top.map(([name, qty], i) => `  ${icons[i]} ${name} — ${qty} sold`).join('\n');
    await send(chatId, `☕ <b>The Dessert Bar — This Week</b>

💰 Revenue: <b>${Math.round(data.totalRev).toLocaleString()} ETB</b>
🛒 Items sold: <b>${data.totalQty}</b>

🏆 <b>Top sellers:</b>
${topLines}`);

  } else if (isGroup) {
    // In group, only respond to commands — ignore normal chat
    return;
  } else {
    await send(chatId, '❓ Unknown command. Type /help to see all commands.');
  }
}

// ── Scheduled reports ─────────────────────────────────────────────
async function sendMorningReport() {
  // 1. Send sales summary to owner
  const data = await getSalesSummary(yesterday());
  const alerts = await getStockAlerts();
  let msg = fmtSales(data, `Yesterday (${yesterday()})`);
  if (alerts.out.length || alerts.low.length) msg += '\n\n' + fmtStock(alerts);
  await send(OWNER_CHAT_ID, msg);

  // 2. Send daily purchase schedule to group
  await send(GROUP_CHAT_ID, fmtDailySchedule());

  // 3. Send stock alerts to group if any
  if (alerts.out.length || alerts.low.length) {
    await send(GROUP_CHAT_ID, fmtStock(alerts));
  }
}

async function sendEveningReport() {
  const data = await getSalesSummary(today());
  await send(OWNER_CHAT_ID, fmtSales(data, `Today (${today()})`));
}

// ── Polling ───────────────────────────────────────────────────────
let offset = 0;
async function poll() {
  try {
    const data = await getUpdates(offset);
    if (data.ok && data.result && data.result.length) {
      for (const update of data.result) {
        offset = update.update_id + 1;
        const msg = update.message;
        if (msg && msg.text && msg.text.startsWith('/')) {
          const chatId = String(msg.chat.id);
          const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
          const fromName = msg.from ? (msg.from.first_name || 'Unknown') : 'Unknown';
          console.log(`[${new Date().toISOString()}] ${isGroup ? 'GROUP' : 'PRIVATE'} from ${fromName}: ${msg.text}`);
          await handleCommand(chatId, msg.text, fromName, isGroup);
        }
      }
    }
  } catch(e) {
    console.error('Poll error:', e.message);
  }
  setTimeout(poll, 2000);
}

// ── Scheduler ─────────────────────────────────────────────────────
function startScheduler() {
  setInterval(async () => {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    if (hhmm === '08:00') await sendMorningReport();
    if (hhmm === '22:00') await sendEveningReport();
  }, 60000);
}

// ── Create purchases table if needed ─────────────────────────────
async function ensurePurchasesTable() {
  // We can't create tables via REST API — user needs to run SQL
  // Just log a reminder
  console.log('Note: Make sure the purchases table exists in Supabase');
}

// ── Start ─────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 The Dessert Bar Bot starting...');

  await send(OWNER_CHAT_ID, `🚀 <b>Dessert Bar Bot is online!</b>
Type /help for commands.`);

  await send(GROUP_CHAT_ID, `🚀 <b>Dessert Bar Stock Bot is now active in this group!</b>

Purchaser — to log a purchase type:
<code>/bought Coffee 10 kg 2200</code>

Type /help for all commands.`);

  startScheduler();
  poll();
  console.log('✅ Bot running!');
}

main().catch(console.error);
