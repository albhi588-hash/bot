# Telegram Active Reminder — ১ মিনিট

এই বট প্রতি ১ মিনিটে চেক করবে।

- গত ১ মিনিটে সদস্যদের নতুন মেসেজ থাকলে আগের রিমাইন্ডার ডিলিট করবে।
- তারপর নতুন রিমাইন্ডার পাঠাবে।
- কোনো নতুন মেসেজ না থাকলে কিছুই পাঠাবে না।

## Render Environment Variables

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `RENDER_EXTERNAL_URL`

## Render Commands

Build Command:

`npm install`

Start Command:

`npm start`

## চালু করার পর

Render URL-এর শেষে একবার `/set-webhook` খুলুন।

উদাহরণ:

`https://your-service.onrender.com/set-webhook`

## Telegram সেটিংস

- বটকে গ্রুপে Admin করুন।
- Delete Messages অনুমতি দিন।
- BotFather → `/setprivacy` → আপনার বট → Disable করুন।