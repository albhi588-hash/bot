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

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return { lastReminderId: null, lastActivityAt: 0, lastCheckedActivityAt: 0 };
    }
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { lastReminderId: null, lastActivityAt: 0, lastCheckedActivityAt: 0 };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function telegram(method, payload) {
  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.description || `${method} failed`);
  }

  return data.result;
}

async function refreshReminderIfActive() {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.error("TELEGRAM_BOT_TOKEN অথবা TELEGRAM_CHAT_ID সেট করা হয়নি।");
    return;
  }

  const state = loadState();

  // গত চেকের পর সদস্যদের নতুন মেসেজ না এলে কিছুই করবে না।
  if (!state.lastActivityAt || state.lastActivityAt <= state.lastCheckedActivityAt) {
    console.log("চ্যাটে নতুন কার্যক্রম নেই—রিমাইন্ডার পাঠানো হয়নি।");
    return;
  }

  if (state.lastReminderId) {
    try {
      await telegram("deleteMessage", {
        chat_id: CHAT_ID,
        message_id: state.lastReminderId,
      });
    } catch (error) {
      console.log("আগের রিমাইন্ডার মুছতে সমস্যা:", error.message);
    }
  }

  try {
    const sent = await telegram("sendMessage", {
      chat_id: CHAT_ID,
      text: MESSAGE,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });

    state.lastReminderId = sent.message_id;
    state.lastCheckedActivityAt = state.lastActivityAt;
    saveState(state);

    console.log("নতুন রিমাইন্ডার পাঠানো হয়েছে:", sent.message_id);
  } catch (error) {
    console.error("রিমাইন্ডার পাঠাতে সমস্যা:", error.message);
  }
}

// Telegram webhook update গ্রহণ করবে।
app.post("/telegram-webhook", (req, res) => {
  const update = req.body || {};
  const message = update.message || update.edited_message;

  if (
    message &&
    String(message.chat?.id) === CHAT_ID &&
    !message.from?.is_bot
  ) {
    const state = loadState();
    state.lastActivityAt = Date.now();
    saveState(state);
  }

  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("Telegram active reminder bot is running.");
});

app.get("/set-webhook", async (req, res) => {
  try {
    const baseUrl = process.env.RENDER_EXTERNAL_URL || req.query.url;
    if (!baseUrl) {
      return res.status(400).send("RENDER_EXTERNAL_URL পাওয়া যায়নি।");
    }

    const result = await telegram("setWebhook", {
      url: `${baseUrl.replace(/\/$/, "")}/telegram-webhook`,
    });

    res.send(`Webhook সেট হয়েছে: ${result}`);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get("/send-now", async (req, res) => {
  const state = loadState();
  state.lastActivityAt = Date.now();
  saveState(state);
  await refreshReminderIfActive();
  res.send("রিমাইন্ডার প্রক্রিয়া সম্পন্ন হয়েছে।");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  setInterval(refreshReminderIfActive, INTERVAL_MS);
});