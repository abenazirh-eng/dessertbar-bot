const https = require('https');

const BOT_TOKEN = '8787023077:AAFTmxyyOIBv3DK8V3Pes7FdTQx8cU_5oJY';
const OWNER_CHAT_ID = '986676229';
const GROUP_CHAT_ID = '-1004290700890';
const SB_URL = 'ivhcimcudidwpnwmfvbd.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2aGNpbWN1ZGlkd3Bud21mdmJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTI0NTYsImV4cCI6MjA5NTg4ODQ1Nn0.0_rcL5LT0tpei47cIKgqPFfDivylvvP6jbUEgbzXFLE';

// Weekly purchase schedule
const WEEKLY_SCHEDULE = {
  0: { day: 'Sunday',    items: ['Eggs', 'Chicken', 'Mozzarella Cheese'] },
  1: { day: 'Monday',    items: ['Chocolate', 'Tea Bags', 'Yo Creme'] },
  2: { day: 'Tuesday',   items: ['KOJJ Flour', 'Creme Cheese', 'Coffee', 'Mercato Items (Bilen)'] },
  3: { day: 'Wednesday', items: ['Butter', 'Oil', 'Sugar Stick', 'Cacao Powder'] },
  4: { day: 'Thursday',  items: ['Sugar', 'Staff Meal Vegetables', 'Beef'] },
  5: { day: 'Friday',    items: ['Vegetables & Fruits', 'Smoked Salmon', 'Normal Salmon', 'Sausage'] },
  6: { day: 'Saturday',  items: ['Water', 'Sprite & Ambo Water'] },
};

// All purchasable items with emojis and units
const PURCHASE_ITEMS = [
  { name: 'Milk',              emoji: '🥛', unit: 'L'   },
  { name: 'Coffee',            emoji: '☕', unit: 'kg'  },
  { name: 'Ice cream powder',  emoji: '🍦', unit: 'kg'  },
  { name: 'Heavy cream',       emoji: '🧴', unit: 'ml'  },
  { name: 'Eggs',              emoji: '🥚', unit: 'pcs' },
  { name: 'Butter',            emoji: '🧈', unit: 'kg'  },
  { name: 'Chicken',           emoji: '🍗', unit: 'kg'  },
  { name: 'Beef',              emoji: '🥩', unit: 'kg'  },
  { name: 'Salmon',            emoji: '🐟', unit: 'kg'  },
  { name: 'Chocolate',         emoji: '🍫', unit: 'pcs' },
  { name: 'Sugar',             emoji: '🍬', unit: 'kg'  },
  { name: 'Flour',             emoji: '🌾', unit: 'kg'  },
  { name: 'Creme Cheese',      emoji: '🧀', unit: 'kg'  },
  { name: 'Mozzarella Cheese', emoji: '🧀', unit: 'kg'  },
  { name: 'Vegetables',        emoji: '🥦', unit: 'kg'  },
  { name: 'Fruits',            emoji: '🍓', unit: 'kg'  },
  { name: 'Yo Creme',          emoji: '🥛', unit: 'L'   },
  { name: 'Cacao Powder',      emoji: '🍫', unit: 'kg'  },
  { name: 'Oil',               emoji: '🫙', unit: 'L'   },
  { name: 'Honey',             emoji: '🍯', unit: 'kg'  },
  { name: 'Tuna',              emoji: '🐟', unit: 'pcs' },
  { name: 'Sausage',           emoji: '🌭', unit: 'pcs' },
  { name: 'Water',             emoji: '💧', unit: 'pcs' },
];

// In-memory session state per user
// State machine: 'select_item' -> 'enter_qty' -> 'enter_price' -> done
const sessions = {};

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
async function send(chatId, text, keyboard = null) {
  const payload = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (keyboard) payload.reply_markup = keyboard;
  const body = JSON.stringify(payload);
  return request({
    hostname: 'api.telegram.org',
    path: `/bot${BOT_TOKEN}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, body);
}

async function answerCallback(callbackQueryId, text = '') {
  const body = JSON.stringify({ callback_query_id: callbackQueryId, text });
  return request({
    hostname: 'api.telegram.org',
    path: `/bot${BOT_TOKEN}/answerCallbackQuery`,
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

// ── Build item selection keyboard ─────────────────────────────────
function buildItemKeyboard() {
  const rows = [];
  for (let i = 0; i < PURCHASE_ITEMS.length; i += 2) {
    const row = [];
    const a = PURCHASE_ITEMS[i];
    row.push({ text: `${a.emoji} ${a.name}`, callback_data: `item_${i}` });
    if (PURCHASE_ITEMS[i + 1]) {
      const b = PURCHASE_ITEMS[i + 1];
      row.push({ text: `${b.emoji} ${b.name}`, callback_data: `item_${i+1}` });
    }
    rows.push(row);
  }
  rows.push([{ text: '❌ Cancel', callback_data: 'cancel' }]);
  return { inline_keyboard: rows };
}

// ── Purchase flow ─────────────────────────────────────────────────
async function startBuyFlow(chatId, fromName) {
  sessions[chatId] = { step: 'select_item', buyer: fromName };
  await send(chatId, `📦 <b>What did you buy?</b>\nSelect an item:`, buildItemKeyboard());
}

async function handleItemSelected(chatId, itemIndex, fromName) {
  const item = PURCHASE_ITEMS[itemIndex];
  if (!item) return;
  sessions[chatId] = {
    step: 'enter_qty',
    item: item,
    buyer: fromName
  };
  await send(chatId, `${item.emoji} <b>${item.name}</b> selected!\n\nHow many <b>${item.unit}</b> did you buy?\n(Type just the number)`);
}

async function handleQtyEntered(chatId, qty) {
  const session = sessions[chatId];
  if (!session || session.step !== 'enter_qty') return false;
  const qtyNum = parseFloat(qty);
  if (isNaN(qtyNum) || qtyNum <= 0) {
    await send(chatId, '❌ Please enter a valid number (e.g. 10 or 5.5)');
    return true;
  }
  session.qty = qtyNum;
  session.step = 'enter_price';
  await send(chatId, `📏 <b>${qtyNum} ${session.item.unit}</b> of ${session.item.emoji} ${session.item.name}\n\nWhat was the <b>unit price</b> per ${session.item.unit}? (in ETB)\n(Type just the number)`);
  return true;
}

async function handlePriceEntered(chatId, price) {
  const session = sessions[chatId];
  if (!session || session.step !== 'enter_price') return false;
  const priceNum = parseFloat(price);
  if (isNaN(priceNum) || priceNum <= 0) {
    await send(chatId, '❌ Please enter a valid price (e.g. 2200)');
    return true;
  }
  session.unitPrice = priceNum;
  session.totalPrice = session.qty * priceNum;

  // Save to database
  await dbPost('purchases', {
    purchase_date: today(),
    item_name: session.item.name,
    qty: session.qty,
    unit: session.item.unit,
    unit_price: session.unitPrice,
    total_price: session.totalPrice,
    buyer_name: session.buyer
  });

  // Update stock if ingredient exists
  let stockMsg = '';
  const encoded = encodeURIComponent(session.item.name);
  const ings = await dbGet(`ingredients?name=ilike.${encoded}`);
  if (Array.isArray(ings) && ings.length > 0) {
    const ing = ings[0];
    const newQty = parseFloat(ing.qty) + session.qty;
    await dbPatch(`ingredients?id=eq.${ing.id}`, { qty: newQty });
    stockMsg = `\n✅ Stock updated: <b>${ing.name} → ${newQty.toFixed(2)} ${ing.unit}</b>`;
  }

  // Send confirmation to group
  const msg = `🛒 <b>Purchase logged by ${session.buyer}</b>

${session.item.emoji} <b>${session.item.name}</b>
📏 Qty: <b>${session.qty} ${session.item.unit}</b>
💵 Unit price: <b>${session.unitPrice.toLocaleString()} ETB/${session.item.unit}</b>
💰 Total: <b>${session.totalPrice.toLocaleString()} ETB</b>
📅 ${today()}${stockMsg}`;

  await send(GROUP_CHAT_ID, msg);

  // If in private chat, also confirm there
  if (String(chatId) !== GROUP_CHAT_ID) {
    await send(chatId, '✅ Purchase recorded successfully!');
  }

  delete sessions[chatId];
  return true;
}

// ── Sales & stock helpers ─────────────────────────────────────────
async function getSalesSummary(date) {
  const sales = await dbGet(`sales?sale_date=eq.${date}&select=qty,revenue,item_name`);
  if (!Array.isArray(sales) || sales.length === 0) return null;
  const totalRev = sales.reduce((a, s) => a + parseFloat(s.revenue), 0);
  const totalQty = sales.reduce((a, s) => a + parseInt(s.qty), 0);
  const itemMap = {};
  sales.forEach(s => { itemMap[s.item_name] = (itemMap[s.item_name] || 0) + parseInt(s.qty); });
  const top = Object.entries(itemMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return { totalRev, totalQty, top };
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

function fmtSales(data, label) {
  if (!data) return `📊 No sales recorded for ${label}.`;
  const icons = ['🥇','🥈','🥉','4️⃣','5️⃣'];
  const topLines = data.top.map(([name, qty], i) => `  ${icons[i]} ${name} — ${qty} sold`).join('\n');
  return `☕ <b>The Dessert Bar — ${label}</b>

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

function fmtDailySchedule() {
  const dow = new Date().getDay();
  const schedule = WEEKLY_SCHEDULE[dow];
  const itemLines = schedule.items.map(i => `  • ${i}`).join('\n');
  return `🛒 <b>Today's Purchasing List — ${schedule.day}</b>

${itemLines}

Tap /buy to log what you purchased.`;
}

// ── Command handler ───────────────────────────────────────────────
async function handleCommand(chatId, text, fromName) {
  const cmd = text.trim().toLowerCase().split(' ')[0];

  if (cmd === '/buy') {
    await startBuyFlow(chatId, fromName);

  } else if (cmd === '/schedule') {
    await send(chatId, fmtDailySchedule());

  } else if (cmd === '/purchases') {
    const since = new Date(); since.setDate(since.getDate() - 7);
    const sinceStr = since.toISOString().split('T')[0];
    const purchases = await dbGet(`purchases?purchase_date=gte.${sinceStr}&order=purchase_date.desc&limit=30`);
    if (!Array.isArray(purchases) || purchases.length === 0) {
      await send(chatId, '🛒 No purchases recorded this week yet.'); return;
    }
    let total = 0;
    let msg = '🛒 <b>Purchase Log — Last 7 Days</b>\n\n';
    purchases.forEach(p => {
      total += parseFloat(p.total_price || 0);
      msg += `${p.purchase_date} — <b>${p.item_name}</b>\n`;
      msg += `  ${p.qty} ${p.unit} @ ${parseFloat(p.unit_price).toLocaleString()} ETB = <b>${parseFloat(p.total_price).toLocaleString()} ETB</b> (${p.buyer_name})\n\n`;
    });
    msg += `💰 <b>Total: ${total.toLocaleString()} ETB</b>`;
    await send(chatId, msg);

  } else if (cmd === '/stock') {
    const alerts = await getStockAlerts();
    await send(chatId, fmtStock(alerts));

  } else if (cmd === '/fullstock') {
    const ings = await dbGet('ingredients?order=name');
    if (!Array.isArray(ings) || !ings.length) { await send(chatId, '📦 No ingredients yet.'); return; }
    let msg = '📦 <b>Full Stock List</b>\n\n';
    ings.forEach(i => {
      const qty = parseFloat(i.qty), min = parseFloat(i.min_qty);
      const icon = qty <= 0 ? '🔴' : (qty <= min && min > 0) ? '🟡' : '🟢';
      msg += `${icon} ${i.name}: <b>${qty.toFixed(2)} ${i.unit}</b>\n`;
    });
    await send(chatId, msg);

  } else if (cmd === '/today') {
    const data = await getSalesSummary(today());
    await send(chatId, fmtSales(data, `Today (${today()})`));

  } else if (cmd === '/yesterday' || cmd === '/sales') {
    const data = await getSalesSummary(yesterday());
    await send(chatId, fmtSales(data, `Yesterday (${yesterday()})`));

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

  } else if (cmd === '/help' || cmd === '/start') {
    await send(chatId, `☕ <b>Dessert Bar Bot Commands</b>

🛒 <b>Purchasing:</b>
/buy — Log a purchase (interactive)
/schedule — Today's purchase list
/purchases — This week's purchase log

📦 <b>Stock:</b>
/stock — Stock alerts
/fullstock — Full stock list

📊 <b>Sales:</b>
/today — Today's sales
/yesterday — Yesterday's summary
/weekly — This week's summary`);
  }
}

// ── Callback query handler (button taps) ─────────────────────────
async function handleCallback(callbackQuery) {
  const chatId = String(callbackQuery.message.chat.id);
  const data = callbackQuery.data;
  const fromName = callbackQuery.from ? callbackQuery.from.first_name : 'Unknown';

  await answerCallback(callbackQuery.id);

  if (data === 'cancel') {
    delete sessions[chatId];
    await send(chatId, '❌ Purchase cancelled.');
    return;
  }

  if (data.startsWith('item_')) {
    const idx = parseInt(data.replace('item_', ''));
    await handleItemSelected(chatId, idx, fromName);
    return;
  }
}

// ── Scheduled reports ─────────────────────────────────────────────
async function sendMorningReport() {
  const data = await getSalesSummary(yesterday());
  const alerts = await getStockAlerts();
  let msg = fmtSales(data, `Yesterday (${yesterday()})`);
  if (alerts.out.length || alerts.low.length) msg += '\n\n' + fmtStock(alerts);
  await send(OWNER_CHAT_ID, msg);
  await send(GROUP_CHAT_ID, fmtDailySchedule());
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

        // Handle button taps
        if (update.callback_query) {
          await handleCallback(update.callback_query);
          continue;
        }

        // Handle messages
        const msg = update.message;
        if (!msg || !msg.text) continue;

        const chatId = String(msg.chat.id);
        const fromName = msg.from ? msg.from.first_name : 'Unknown';
        const text = msg.text;

        console.log(`[${new Date().toISOString()}] ${fromName} (${chatId}): ${text}`);

        // Check if user is in a buy session and entering qty or price
        if (sessions[chatId] && !text.startsWith('/')) {
          const step = sessions[chatId].step;
          if (step === 'enter_qty') {
            await handleQtyEntered(chatId, text);
            continue;
          }
          if (step === 'enter_price') {
            await handlePriceEntered(chatId, text);
            continue;
          }
        }

        // Handle commands
        if (text.startsWith('/')) {
          await handleCommand(chatId, text, fromName);
        }
      }
    }
  } catch(e) {
    console.error('Poll error:', e.message);
  }
  setTimeout(poll, 1500);
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

// ── Start ─────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 The Dessert Bar Bot starting...');
  await send(OWNER_CHAT_ID, '🚀 <b>Dessert Bar Bot is online!</b>\nType /help for commands.');
  await send(GROUP_CHAT_ID, `🚀 <b>Dessert Bar Stock Bot updated!</b>

Purchaser — tap /buy to log a purchase.
No typing needed — just tap the buttons!`);
  startScheduler();
  poll();
  console.log('✅ Bot running!');
}

main().catch(console.error);
