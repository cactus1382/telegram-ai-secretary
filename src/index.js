require("dotenv").config();
const path = require("path");
const express = require("express");
const { Bot } = require("grammy");
const { Store } = require("./db");
const { createSecretary } = require("./secretary");

function required(key) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    console.error(`Missing required environment variable: ${key}`);
    console.error("Copy .env.example to .env and fill it in.");
    process.exit(1);
  }
  return value.trim();
}

const BOT_TOKEN = required("BOT_TOKEN");
const OPENAI_API_KEY = required("OPENAI_API_KEY");
const OWNER_CHAT_ID = Number(required("OWNER_CHAT_ID"));
const BUSINESS_CONNECTION_ID = process.env.BUSINESS_CONNECTION_ID?.trim() || "";
const MODE = process.env.MODE?.trim().toLowerCase() === "auto" ? "auto" : "draft";
const PORT = Number(process.env.PORT || 3000);
const WEBHOOK_URL = process.env.WEBHOOK_URL?.trim() || "";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET?.trim() || "";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL?.trim() || "";
const MODEL = process.env.MODEL?.trim() || "gpt-4o-mini";
const AUTO_MAX_CHARS = Number(process.env.AUTO_MAX_CHARS || 800);
const HISTORY_LIMIT = Number(process.env.HISTORY_LIMIT || 10);
const DB_PATH = process.env.DB_PATH?.trim() || path.join(process.cwd(), "data", "secretary.db");

if (!Number.isInteger(OWNER_CHAT_ID) || OWNER_CHAT_ID <= 0) {
  console.error("OWNER_CHAT_ID must be a numeric Telegram user ID.");
  process.exit(1);
}

const cfg = {
  ownerChatId: OWNER_CHAT_ID,
  businessConnectionId: BUSINESS_CONNECTION_ID,
  mode: MODE,
  openaiApiKey: OPENAI_API_KEY,
  openaiBaseUrl: OPENAI_BASE_URL,
  model: MODEL,
  autoMaxChars: AUTO_MAX_CHARS,
  historyLimit: HISTORY_LIMIT,
};

const store = new Store(DB_PATH);
const bot = new Bot(BOT_TOKEN);

createSecretary({ bot, store, cfg });

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    mode: cfg.mode,
    connection: cfg.businessConnectionId || "auto-attach",
    model: cfg.model,
  });
});

// Telegram posts updates here when a webhook is configured.
const WEBHOOK_PATH = `/webhook/${BOT_TOKEN.replace(/[^A-Za-z0-9_-]/g, "")}`;
app.post(WEBHOOK_PATH, async (req, res) => {
  if (WEBHOOK_SECRET && req.headers["x-telegram-bot-api-secret-token"] !== WEBHOOK_SECRET) {
    return res.sendStatus(401);
  }
  try {
    await bot.handleUpdate(req.body);
  } catch (err) {
    console.error("Update handling failed:", err?.message || err);
  }
  res.sendStatus(200);
});

async function startBot() {
  if (WEBHOOK_URL) {
    const url = WEBHOOK_URL.replace(/\/+$/, "") + WEBHOOK_PATH;
    await bot.api.setWebhook(url, WEBHOOK_SECRET ? { secret_token: WEBHOOK_SECRET } : {});
    console.log(`Webhook set to ${url}`);
    return;
  }
  // Long-polling: good for local dev and for servers without a public domain.
  await bot.start({
    allowed_updates: [
      "message",
      "business_connection",
      "business_message",
      "edited_business_message",
      "callback_query",
    ],
    onStart: (info) => console.log(`Bot @${info.username} started in long-polling mode (${cfg.mode} mode)`),
  });
}

function main() {
  // Start the HTTP listener first so a health check never depends on Telegram.
  app.listen(PORT, () => {
    console.log(`HTTP listening on :${PORT}`);
    startBot().catch((err) => {
      console.error("Bot failed to start:", err?.message || err);
      console.error("Check BOT_TOKEN and your network. The HTTP server stays up; fix the token and restart.");
      process.exitCode = 1;
    });
  });
}

process.on("SIGINT", () => {
  console.log("Shutting down…");
  store.close();
  process.exit(0);
});
process.on("SIGTERM", () => {
  store.close();
  process.exit(0);
});

main();
