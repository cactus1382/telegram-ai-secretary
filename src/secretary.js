const fs = require("fs");
const path = require("path");
const { InlineKeyboard } = require("grammy");
const OpenAI = require("openai");
const { buildSystemPrompt, loadKnowledge, summariseForOwner } = require("./prompts");

const PAUSE_KEY = "paused";
const MODE_KEY = "mode";
const BLOCK_PREFIX = "block:";

function createSecretary({ bot, store, cfg }) {
  const client = new OpenAI({
    apiKey: cfg.openaiApiKey,
    baseURL: cfg.openaiBaseUrl || undefined,
  });

  const state = {
    // owner chat id -> { draftId } awaiting the owner's edited text
    pendingEdit: new Map(),
  };

  const kbPath = cfg.kbPath || path.join(__dirname, "..", "data", "kb.md");

  function isBlocked(chatId) {
    return store.getSetting(`${BLOCK_PREFIX}${chatId}`, "0") === "1";
  }

  function setBlocked(chatId, blocked) {
    store.setSetting(`${BLOCK_PREFIX}${chatId}`, blocked ? "1" : "0");
  }

  function isPaused() {
    return store.getSetting(PAUSE_KEY, "0") === "1";
  }

  function getMode() {
    return store.getSetting(MODE_KEY, cfg.mode || "draft");
  }

  function loadKb() {
    return loadKnowledge(kbPath);
  }

  /**
   * Ask the LLM for a reply. Returns { reply, needs_human, intent }.
   * Throws on network / API failure so callers can fall back to the owner.
   */
  async function generateReply({ connectionId, chatId, incomingText }) {
    const history = store.history(connectionId, chatId, cfg.historyLimit || 10);
    const knowledge = loadKb();

    const messages = [
      { role: "system", content: buildSystemPrompt({ knowledge }) },
      ...history
        .filter((m) => m.text)
        .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text })),
      { role: "user", content: incomingText },
    ];

    const completion = await client.chat.completions.create({
      model: cfg.model || "gpt-4o-mini",
      messages,
      temperature: 0.4,
      max_tokens: 300,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      parsed = {};
    }
    return {
      reply: typeof parsed.reply === "string" ? parsed.reply.trim() : "",
      needs_human: parsed.needs_human === true,
      intent: typeof parsed.intent === "string" ? parsed.intent : "",
    };
  }

  function keyboardFor(draftId) {
    return new InlineKeyboard()
      .text("✅ Approve & send", `a:${draftId}`)
      .text("✏️ Edit", `e:${draftId}`)
      .row()
      .text("🔁 Regenerate", `r:${draftId}`)
      .text("🗑 Discard", `d:${draftId}`);
  }

  async function sendOnBehalf(connectionId, chatId, text) {
    await bot.api.sendMessage(chatId, text, { business_connection_id: connectionId });
  }

  /**
   * The trust layer: whatever the AI produced is first shown to the owner.
   * In draft mode nothing leaves without approval. In auto mode it is sent
   * immediately unless the AI flagged it needs_human.
   */
  async function handleIncoming(ctx, msg) {
    const connectionId = msg.business_connection_id;
    const chatId = msg.chat.id;
    const text = msg.text || msg.caption || "";

    if (!connectionId) return;
    if (msg.chat.type !== "private") return;
    if (isBlocked(chatId)) return;

    const connection = store.getConnection(connectionId);
    if (!connection || !connection.enabled || !connection.can_reply) {
      await notifyOwner(
        cfg.ownerChatId,
        `⚠️ A customer messaged me, but business connection ${connectionId} is not enabled to reply. Open the bot in @BotFather → Business Mode and reconnect.`
      );
      return;
    }

    // The owner's own outgoing messages also arrive here. Never answer those.
    if (msg.from && connection.user_id && msg.from.id === connection.user_id) return;
    if (msg.is_from_offline) return;

    if (isPaused()) {
      await notifyOwner(cfg.ownerChatId, `⏸ Bot is paused — I did not answer ${chatId}. Send /resume to re-enable.`);
      return;
    }

    if (!text.trim()) {
      await notifyOwner(
        cfg.ownerChatId,
        `📥 ${chatId} sent a non-text message (sticker/media). I only draft text replies — answer them yourself.`
      );
      return;
    }

    store.addMessage({
      connection_id: connectionId,
      chat_id: chatId,
      role: "user",
      text,
      msg_id: msg.message_id,
      created_at: Date.now(),
    });

    let result;
    try {
      result = await generateReply({ connectionId, chatId, incomingText: text });
    } catch (err) {
      await notifyOwner(
        cfg.ownerChatId,
        `❌ AI call failed for ${chatId}: ${err?.message || err}. No reply was sent. Draft mode is still safe — fix the key and the next message will draft again.`
      );
      return;
    }

    if (!result.reply || result.needs_human) {
      await notifyOwner(
        cfg.ownerChatId,
        `🙋 ${chatId} needs you personally (${summariseForOwner(result)}):\n\n"${text}"\n\nNo reply was sent.`
      );
      return;
    }

    const draftId = store.createDraft({
      connection_id: connectionId,
      chat_id: chatId,
      msg_id: msg.message_id,
      text: result.reply,
      intent: result.intent,
      needs_human: result.needs_human ? 1 : 0,
      created_at: Date.now(),
    });

    const mode = getMode();
    if (mode === "auto") {
      const safe = result.reply.slice(0, cfg.autoMaxChars || 800);
      await sendOnBehalf(connectionId, chatId, safe);
      store.setDraftStatus(draftId, "sent");
      store.addMessage({
        connection_id: connectionId,
        chat_id: chatId,
        role: "assistant",
        text: safe,
        msg_id: null,
        created_at: Date.now(),
      });
      await notifyOwner(
        cfg.ownerChatId,
        `🤖 Auto-sent to ${chatId} (${result.intent}):\n\n${safe}`
      );
      return;
    }

    // Draft mode: nothing is sent without the owner.
    await bot.api.sendMessage(
      cfg.ownerChatId,
      `📨 Draft reply to ${chatId} — ${summariseForOwner(result)}\n\n👤 Customer: ${text}\n\n🤖 Draft:\n${result.reply}`,
      { reply_markup: keyboardFor(draftId) }
    );
  }

  async function notifyOwner(chatId, text) {
    try {
      await bot.api.sendMessage(chatId, text);
    } catch (err) {
      console.error("Could not notify owner:", err?.message || err);
    }
  }

  // ---- business_connection lifecycle ----
  bot.on("business_connection", async (ctx) => {
    const bc = ctx.update.business_connection;
    store.upsertConnection({
      business_connection_id: bc.id,
      owner_chat_id: cfg.ownerChatId,
      user_id: bc.user?.id || 0,
      can_reply: bc.can_reply ? 1 : 0,
      enabled: bc.is_enabled !== false ? 1 : 0,
      username: bc.user?.username || null,
      created_at: Date.now(),
    });
    const enabled = bc.is_enabled !== false;
    const canReply = !!bc.can_reply;
    await notifyOwner(
      cfg.ownerChatId,
      enabled
        ? `🔌 Business account ${bc.user?.username ? "@" + bc.user.username : bc.id} connected.\ncan_reply = ${canReply} — ${canReply ? "I can answer DMs on your behalf." : "I cannot reply. In @BotFather → Bot Settings → Business Mode, grant the right to reply."}`
        : `🔌 Business account ${bc.id} disconnected. I will no longer answer its DMs.`
    );
  });

  // ---- incoming customer DM ----
  bot.on("business_message", async (ctx) => {
    await handleIncoming(ctx, ctx.msg);
  });

  // ---- owner approval keyboard ----
  bot.callbackQuery(/^a:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const draft = store.getDraft(id);
    if (!draft || draft.status !== "pending") return await ctx.answerCallbackQuery({ text: "Already handled." });
    await sendOnBehalf(draft.connection_id, draft.chat_id, draft.text);
    store.setDraftStatus(id, "sent");
    store.addMessage({
      connection_id: draft.connection_id,
      chat_id: draft.chat_id,
      role: "assistant",
      text: draft.text,
      msg_id: null,
      created_at: Date.now(),
    });
    await ctx.editMessageText(`✅ Sent to ${draft.chat_id}:\n\n${draft.text}`);
    await ctx.answerCallbackQuery({ text: "Sent." });
  });

  bot.callbackQuery(/^e:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const draft = store.getDraft(id);
    if (!draft || draft.status !== "pending") return await ctx.answerCallbackQuery({ text: "Already handled." });
    state.pendingEdit.set(cfg.ownerChatId, { draftId: id });
    await ctx.editMessageText(`✏️ Send me the corrected reply for ${draft.chat_id} now — one message, plain text.`);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^r:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const draft = store.getDraft(id);
    if (!draft || draft.status !== "pending") return await ctx.answerCallbackQuery({ text: "Already handled." });
    await ctx.answerCallbackQuery({ text: "Regenerating…" });
    const history = store.history(draft.connection_id, draft.chat_id, cfg.historyLimit || 10);
    const original = store
      .history(draft.connection_id, draft.chat_id, 40)
      .reverse()
      .find((m) => m.role === "user" && m.msg_id === draft.msg_id);
    let result;
    try {
      result = await generateReply({
        connectionId: draft.connection_id,
        chatId: draft.chat_id,
        incomingText: original ? original.text : "",
      });
    } catch (err) {
      await notifyOwner(cfg.ownerChatId, `❌ Regeneration failed: ${err?.message || err}`);
      return;
    }
    if (!result.reply) return await notifyOwner(cfg.ownerChatId, "Regeneration produced no reply.");
    store.setDraftText(id, result.reply);
    await ctx.editMessageText(
      `♻️ Regenerated draft for ${draft.chat_id} — ${summariseForOwner(result)}\n\n🤖 Draft:\n${result.reply}`,
      { reply_markup: keyboardFor(id) }
    );
  });

  bot.callbackQuery(/^d:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const draft = store.getDraft(id);
    if (!draft || draft.status !== "pending") return await ctx.answerCallbackQuery({ text: "Already handled." });
    store.setDraftStatus(id, "discarded");
    await ctx.editMessageText(`🗑 Discarded. Nothing was sent to ${draft.chat_id}.`);
    await ctx.answerCallbackQuery();
  });

  // ---- owner's edited replacement text ----
  bot.on("message:text", async (ctx) => {
    if (ctx.chat.id !== cfg.ownerChatId) return;
    const pending = state.pendingEdit.get(cfg.ownerChatId);
    if (!pending) return;
    const draft = store.getDraft(pending.draftId);
    state.pendingEdit.delete(cfg.ownerChatId);
    if (!draft || draft.status !== "pending") {
      await ctx.reply("That draft is no longer pending.");
      return;
    }
    store.setDraftText(pending.draftId, ctx.msg.text);
    await ctx.reply(
      `✏️ Edited draft for ${draft.chat_id}. Approve to send:\n\n${ctx.msg.text}`,
      { reply_markup: keyboardFor(pending.draftId) }
    );
  });

  // ---- owner commands ----
  bot.command("start", async (ctx) => {
    if (ctx.chat.id !== cfg.ownerChatId) return;
    await ctx.reply(
      [
        "👋 I'm your AI secretary. I answer DMs to your Telegram *Business* account as you.",
        "",
        "How to connect:",
        "1. Get a Telegram Business subscription (Premium → Business).",
        "2. Open @BotFather → /mybots → pick me → *Business Mode* → connect your account.",
        "3. When a customer DMs you, I draft a reply and send it to you here for approval (draft mode) or send it and log it (auto mode).",
        "",
        "Commands: /help /mode /kb /stats /pause /resume /block /unblock",
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  });

  bot.command("help", async (ctx) => {
    if (ctx.chat.id !== cfg.ownerChatId) return;
    await ctx.reply(
      [
        "*Commands*",
        "/mode draft|auto — draft mode = every reply needs your approval; auto mode = answers sent immediately and logged to you",
        "/kb — show the knowledge base I answer from (edit data/kb.md on the server)",
        "/stats — how many DMs handled and replies sent",
        "/pause — stop answering until /resume",
        "/block <chat_id> — never answer this chat again",
        "/unblock <chat_id> — answer it again",
        "",
        "*How to make me better*: put your FAQ, prices, hours, and policies in data/kb.md and restart. I only answer from that document.",
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  });

  bot.command("mode", async (ctx) => {
    if (ctx.chat.id !== cfg.ownerChatId) return;
    const arg = ctx.match.trim().toLowerCase();
    if (arg !== "draft" && arg !== "auto") {
      await ctx.reply(`Current mode: *${getMode()}*. Use /mode draft or /mode auto.`, { parse_mode: "Markdown" });
      return;
    }
    store.setSetting(MODE_KEY, arg);
    await ctx.reply(`Mode set to *${arg}*.`, { parse_mode: "Markdown" });
  });

  bot.command("kb", async (ctx) => {
    if (ctx.chat.id !== cfg.ownerChatId) return;
    const kb = loadKb();
    await ctx.reply(
      kb
        ? `📄 Current knowledge base (${kb.length} chars):\n\n${kb.slice(0, 3500)}${kb.length > 3500 ? "\n…(truncated)" : ""}`
        : "⚠️ No knowledge base found. Create data/kb.md on the server with your FAQ, prices, hours and policies. Until then I will hand most questions to you."
    );
  });

  bot.command("stats", async (ctx) => {
    if (ctx.chat.id !== cfg.ownerChatId) return;
    const s = store.stats();
    await ctx.reply(
      [
        "*Stats*",
        `Incoming DMs: ${s.incoming}`,
        `Replies sent on your behalf: ${s.outgoing}`,
        `Drafts created: ${s.drafts}`,
        `Drafts approved/sent: ${s.sent}`,
        `Drafts discarded: ${s.discarded}`,
        `Mode: ${getMode()} · Paused: ${isPaused()}`,
      ].join("\n"),
      { parse_mode: "Markdown" }
    );
  });

  bot.command("pause", async (ctx) => {
    if (ctx.chat.id !== cfg.ownerChatId) return;
    store.setSetting(PAUSE_KEY, "1");
    await ctx.reply("⏸ Paused. I will not answer DMs until /resume.");
  });

  bot.command("resume", async (ctx) => {
    if (ctx.chat.id !== cfg.ownerChatId) return;
    store.setSetting(PAUSE_KEY, "0");
    await ctx.reply("▶️ Resumed. Answering DMs again.");
  });

  bot.command("block", async (ctx) => {
    if (ctx.chat.id !== cfg.ownerChatId) return;
    const id = ctx.match.trim();
    if (!/^-?\d+$/.test(id)) return await ctx.reply("Usage: /block <chat_id>");
    setBlocked(Number(id), true);
    await ctx.reply(`🚫 ${id} blocked. I will not answer it.`);
  });

  bot.command("unblock", async (ctx) => {
    if (ctx.chat.id !== cfg.ownerChatId) return;
    const id = ctx.match.trim();
    if (!/^-?\d+$/.test(id)) return await ctx.reply("Usage: /unblock <chat_id>");
    setBlocked(Number(id), false);
    await ctx.reply(`✅ ${id} unblocked.`);
  });
}

module.exports = { createSecretary };
