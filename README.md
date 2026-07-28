# Telegram Premium Active Reminder Bot

## ফিচার

- চ্যাট সক্রিয় থাকলে প্রতি ১ মিনিটে রিমাইন্ডার পাঠাবে
- আগের রিমাইন্ডার ডিলিট করবে
- চ্যাট নিষ্ক্রিয় থাকলে নতুন রিমাইন্ডার পাঠাবে না
- `/start` — বট অনলাইন কিনা দেখাবে
- `/status` — বর্তমান স্ট্যাটাস দেখাবে
- `/test` — সঙ্গে সঙ্গে টেস্ট রিমাইন্ডার পাঠাবে

## Environment Variables

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `RENDER_EXTERNAL_URL`

## Render Commands

Build Command:

`npm install`

Start Command:

`npm start`

## Deploy হওয়ার পর

ব্রাউজারে খুলুন:

`https://আপনার-সার্ভিস.onrender.com/set-webhook`

## Telegram সেটিংস

1. বটকে গ্রুপে Admin করুন
2. Delete Messages অনুমতি দিন
3. BotFather → `/setprivacy` → আপনার বট → Disable