const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || "");
const INTERVAL_MS = 60 * 1000;

const MESSAGE = `⚠️ <b>WARNING</b>

Our admins will never ask for money in private messages.

✅ If you make a deal anywhere other than this official Deal Box, you are at high risk of being scammed.

━━━━━━━━━━━━━━━━━━

⚠️ <b>সতর্কতা</b>

আমাদের কোনো এডমিন কখনো ব্যক্তিগত ইনবক্সে টাকা চাইবে না।

✅ আমাদের এই অফিসিয়াল ডিল বক্স ব্যতীত অন্য কোথাও ডিল করলে প্রতারণার শিকার হওয়ার ঝুঁকি রয়েছে।`;

const STATE_FILE = path.join(__dirname, "state.json");

function defaultState() {
  return {
    lastReminderId: null,
    lastActivityAt: 0,
    lastCheckedActivityAt: 0,
    lastReminderAt: 0
  };
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return defaultState();
    return { ...defaultState(), ...JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function telegram(method, payload) {
  if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN সেট করা হয়নি।");

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.description || `${method} failed`);
  }

  return data.result;
}

async function sendText(chatId, text, replyToMessageId = null) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };

  if (replyToMessageId) {
    payload.reply_parameters = { message_id: replyToMessageId };
  }

  return telegram("sendMessage", payload);
}

async function deleteOldReminder(state) {
  if (!state.lastReminderId) return;

  try {
    await telegram("deleteMessage", {
      chat_id: CHAT_ID,
      message_id: state.lastReminderId
    });
  } catch (error) {
    console.log("আগের রিমাইন্ডার মুছতে সমস্যা:", error.message);
  }
}

async function sendReminder(force = false) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.error("TELEGRAM_BOT_TOKEN অথবা TELEGRAM_CHAT_ID সেট করা হয়নি।");
    return { sent: false, reason: "missing_env" };
  }

  const state = loadState();

  if (
    !force &&
    (!state.lastActivityAt || state.lastActivityAt <= state.lastCheckedActivityAt)
  ) {
    console.log("নতুন গ্রুপ কার্যক্রম নেই—রিমাইন্ডার পাঠানো হয়নি।");
    return { sent: false, reason: "inactive" };
  }

  await deleteOldReminder(state);

  try {
    const sent = await sendText(CHAT_ID, MESSAGE);

    state.lastReminderId = sent.message_id;
    state.lastReminderAt = Date.now();

    if (!force) {
      state.lastCheckedActivityAt = state.lastActivityAt;
    } else {
      state.lastCheckedActivityAt = Math.max(
        state.lastCheckedActivityAt,
        state.lastActivityAt
      );
    }

    saveState(state);
    console.log("নতুন রিমাইন্ডার পাঠানো হয়েছে:", sent.message_id);

    return { sent: true, messageId: sent.message_id };
  } catch (error) {
    console.error("রিমাইন্ডার পাঠাতে সমস্যা:", error.message);
    return { sent: false, reason: error.message };
  }
}

function formatTime(timestamp) {
  if (!timestamp) return "এখনও পাঠানো হয়নি";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(new Date(timestamp));
}

async function handleCommand(message) {
  const text = String(message.text || "").trim();
  const command = text.split(/\s+/)[0].split("@")[0].toLowerCase();
  const chatId = String(message.chat?.id || "");

  if (chatId !== CHAT_ID) return false;

  if (command === "/start") {
    await sendText(
      chatId,
      `✅ <b>Bot is Online</b>

এই বট চ্যাট সক্রিয় থাকলে প্রতি ১ মিনিটে আগের সতর্কবার্তা মুছে নতুনটি পাঠাবে।

<b>Commands</b>
/status — বটের অবস্থা দেখুন
/test — এখনই টেস্ট রিমাইন্ডার পাঠান`,
      message.message_id
    );
    return true;
  }

  if (command === "/status") {
    const state = loadState();

    await sendText(
      chatId,
      `🟢 <b>Reminder Bot Status</b>

✅ Bot: Online
⏱ Interval: 1 minute
💬 Active-only mode: ON
🗑 Auto delete: ON
📢 Last reminder: ${formatTime(state.lastReminderAt)}`,
      message.message_id
    );
    return true;
  }

  if (command === "/test") {
    await sendText(chatId, "⏳ টেস্ট রিমাইন্ডার পাঠানো হচ্ছে…", message.message_id);
    await sendReminder(true);
    return true;
  }

  return false;
}

app.post("/telegram-webhook", async (req, res) => {
  // Telegram-কে দ্রুত 200 response দেওয়া জরুরি।
  res.sendStatus(200);

  try {
    const update = req.body || {};
    const message = update.message || update.edited_message;

    if (!message || String(message.chat?.id || "") !== CHAT_ID) return;
    if (message.from?.is_bot) return;

    const handled = await handleCommand(message);

    // কমান্ড ছাড়া সাধারণ সদস্যের মেসেজই activity হিসেবে ধরা হবে।
    if (!handled) {
      const state = loadState();
      state.lastActivityAt = Date.now();
      saveState(state);
    }
  } catch (error) {
    console.error("Webhook processing error:", error.message);
  }
});

app.get("/", (req, res) => {
  res.send("Telegram Premium Active Reminder Bot is running.");
});

app.get("/set-webhook", async (req, res) => {
  try {
    const baseUrl = process.env.RENDER_EXTERNAL_URL || req.query.url;

    if (!baseUrl) {
      return res.status(400).send("RENDER_EXTERNAL_URL সেট করা হয়নি।");
    }

    const webhookUrl = `${baseUrl.replace(/\/$/, "")}/telegram-webhook`;

    const result = await telegram("setWebhook", {
      url: webhookUrl,
      allowed_updates: ["message", "edited_message"],
      drop_pending_updates: true
    });

    res.send(`✅ Webhook সেট হয়েছে: ${result}<br>${webhookUrl}`);
  } catch (error) {
    res.status(500).send(`❌ ${error.message}`);
  }
});

app.get("/webhook-info", async (req, res) => {
  try {
    const info = await telegram("getWebhookInfo", {});
    res.json(info);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get("/send-now", async (req, res) => {
  const result = await sendReminder(true);
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  setInterval(() => sendReminder(false), INTERVAL_MS);
});