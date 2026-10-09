// End-to-end test harness: registers the secretary against a fake grammY bot
// that records handler registrations, then drives them with fake context objects.
process.env.BOT_TOKEN = "1:tok";
process.env.OPENAI_API_KEY = "sk-test";
process.env.OWNER_CHAT_ID = "999";

const path = require("path");
const os = require("os");
const fs = require("fs");

const tmpdb = path.join(os.tmpdir(), "sec_e2e2.json");
fs.rmSync(tmpdb, { force: true });

// Stub openai before secretary requires it
let nextReply = "Sure! Our price is 185,000 Toman.";
let shouldFail = false;
let lastCall = null;
const openaiPath = require.resolve("openai");
require.cache[openaiPath] = {
  id: openaiPath,
  filename: openaiPath,
  loaded: true,
  paths: [],
  exports: function FakeOpenAI({ apiKey, baseURL }) {
    return {
      chat: {
        completions: {
          create: async (opts) => {
            if (shouldFail) throw new Error("API key invalid");
            lastCall = opts;
            return {
              choices: [
                { message: { content: JSON.stringify({ reply: nextReply, needs_human: false, intent: "price enquiry" }) } },
              ],
            };
          },
        },
      },
    };
  },
};

const { Store } = require("../src/db");
const { createSecretary } = require("../src/secretary");

const sent = [];
const edited = [];
const answered = [];
const handlers = { callback: new Map(), messageText: [], command: new Map() };

function fakeCtx(overrides) {
  return {
    chat: { id: overrides.chatId ?? 999 },
    msg: overrides.msg ?? {},
    match: overrides.match ?? [],
    update: overrides.update ?? {},
    reply: async (text, opts) => { sent.push({ chatId: overrides.chatId ?? 999, text, opts }); },
    answerCallbackQuery: async (o) => { answered.push(o); },
    editMessageText: async (text, opts) => { edited.push({ text, opts }); },
    ...overrides,
  };
}

const bot = {
  api: {
    sendMessage: async (chatId, text, opts) => { sent.push({ chatId, text, opts }); return { message_id: sent.length }; },
    setWebhook: async () => ({}),
  },
  on: (filter, fn) => {
    if (filter === "message:text") handlers.messageText.push(fn);
    else handlers[filter] = fn;
  },
  command: (cmd, fn) => { handlers.command.set(cmd, fn); },
  callbackQuery: (re, fn) => { handlers.callback.set(re.source || re, fn); },
  start: (o) => { handlers.started = o; },
};

const store = new Store(tmpdb);
const cfg = {
  ownerChatId: 999,
  businessConnectionId: "",
  mode: "draft",
  openaiApiKey: "x",
  openaiBaseUrl: "",
  model: "m",
  autoMaxChars: 800,
  historyLimit: 10,
};
createSecretary({ bot, store, cfg });

let failures = 0;
function check(cond, label) {
  console.log((cond ? "PASS  " : "FAIL  ") + label);
  if (!cond) failures++;
}

(async () => {
  await handlers["business_connection"](
    fakeCtx({
      update: {
        business_connection: {
          id: "bc1",
          user: { id: 42, username: "ownerbiz" },
          can_reply: true,
          is_enabled: true,
        },
      },
    })
  );
  check(store.getConnection("bc1") != null, "connection stored");
  check(sent.some((m) => m.text.includes("connected")), "owner notified of connection");
  sent.length = 0;

  await handlers["business_message"](
    fakeCtx({
      msg: {
        business_connection_id: "bc1",
        chat: { id: 100, type: "private" },
        from: { id: 555 },
        message_id: 7,
        text: "How much is the Ghormeh Sabzi?",
        is_from_offline: false,
      },
    })
  );
  const draft = store.pendingDraft("bc1", 100, 7);
  check(draft != null, "draft created");
  check(sent.some((m) => m.chatId === 999 && m.text.includes("How much")), "draft shown to owner");
  check(!sent.some((m) => m.chatId === 100), "NOTHING sent to customer in draft mode");
  check(sent.some((m) => m.opts?.reply_markup != null), "approval keyboard attached");
  const kbButtons = sent.find((m) => m.opts?.reply_markup);
  check(JSON.stringify(kbButtons.opts.reply_markup).includes("a:" + draft.id), "approve button wired to draft id");
  sent.length = 0;

  check(lastCall.messages[0].content.includes("KNOWLEDGE DOCUMENT"), "system prompt built from kb.md");
  check(lastCall.messages.some((m) => m.role === "user" && m.content.includes("How much")), "customer text passed to LLM");

  await handlers["business_message"](
    fakeCtx({
      msg: {
        business_connection_id: "bc1",
        chat: { id: 100, type: "private" },
        from: { id: 42 },
        message_id: 8,
        text: "my own reply",
        is_from_offline: false,
      },
    })
  );
  check(sent.length === 0, "owner's own message ignored");

  await handlers.callback.get("^a:(\\d+)$")(fakeCtx({ match: ["a:" + draft.id, String(draft.id)] }));
  check(store.getDraft(draft.id).status === "sent", "draft marked sent after approval");
  check(sent.some((m) => m.chatId === 100 && m.opts?.business_connection_id === "bc1"), "reply sent AS the business account");
  check(store.history("bc1", 100, 10).some((m) => m.role === "assistant"), "assistant reply recorded in history");
  check(edited.some((e) => e.text.includes("Sent to 100")), "owner message updated to 'sent'");
  sent.length = 0; edited.length = 0;

  await handlers["business_message"](
    fakeCtx({
      msg: {
        business_connection_id: "bc1",
        chat: { id: 101, type: "private" },
        from: { id: 556 },
        message_id: 9,
        text: "Do you deliver?",
      },
    })
  );
  const d2 = store.pendingDraft("bc1", 101, 9);
  await handlers.callback.get("^e:(\\d+)$")(fakeCtx({ match: ["e:" + d2.id, String(d2.id)] }));
  await handlers.messageText[0](fakeCtx({ chatId: 999, msg: { text: "Yes we deliver!" } }));
  check(store.getDraft(d2.id).text === "Yes we deliver!", "owner edit replaced draft text");
  await handlers.callback.get("^a:(\\d+)$")(fakeCtx({ match: ["a:" + d2.id, String(d2.id)] }));
  check(sent.some((m) => m.chatId === 101 && m.text === "Yes we deliver!"), "edited text sent to customer");
  sent.length = 0;

  await handlers["business_message"](
    fakeCtx({
      msg: {
        business_connection_id: "bc1",
        chat: { id: 102, type: "private" },
        from: { id: 557 },
        message_id: 10,
        text: "spam spam",
      },
    })
  );
  const d3 = store.pendingDraft("bc1", 102, 10);
  await handlers.callback.get("^d:(\\d+)$")(fakeCtx({ match: ["d:" + d3.id, String(d3.id)] }));
  check(store.getDraft(d3.id).status === "discarded", "draft discarded");
  check(!sent.some((m) => m.chatId === 102), "nothing sent on discard");
  sent.length = 0;

  nextReply = "";
  await handlers["business_message"](
    fakeCtx({
      msg: {
        business_connection_id: "bc1",
        chat: { id: 103, type: "private" },
        from: { id: 558 },
        message_id: 11,
        text: "I want a refund for a big catering order",
      },
    })
  );
  check(sent.some((m) => m.chatId === 999 && m.text.includes("needs you personally")), "empty reply escalated to owner");
  check(!sent.some((m) => m.chatId === 103), "nothing auto-sent when reply empty");
  sent.length = 0;
  nextReply = "Sure! Our price is 185,000 Toman.";

  store.setSetting("mode", "auto");
  await handlers["business_message"](
    fakeCtx({
      msg: {
        business_connection_id: "bc1",
        chat: { id: 104, type: "private" },
        from: { id: 559 },
        message_id: 12,
        text: "price?",
      },
    })
  );
  const auto = store.data.drafts.filter((d) => d.chat_id === 104)[0];
  check(auto && auto.status === "sent", "auto mode draft auto-sent");
  check(sent.some((m) => m.chatId === 104 && m.opts?.business_connection_id === "bc1"), "auto mode sent as business account");
  check(sent.some((m) => m.chatId === 999 && m.text.includes("Auto-sent")), "auto mode logged to owner");
  sent.length = 0;

  store.setSetting("paused", "1");
  await handlers["business_message"](
    fakeCtx({
      msg: {
        business_connection_id: "bc1",
        chat: { id: 105, type: "private" },
        from: { id: 560 },
        message_id: 13,
        text: "hello?",
      },
    })
  );
  check(!sent.some((m) => m.chatId === 105), "paused bot does not answer");
  check(store.pendingDraft("bc1", 105, 13) == null, "paused bot creates no draft");
  store.setSetting("paused", "0");
  sent.length = 0;

  store.setSetting("block:106", "1");
  await handlers["business_message"](
    fakeCtx({
      msg: {
        business_connection_id: "bc1",
        chat: { id: 106, type: "private" },
        from: { id: 561 },
        message_id: 14,
        text: "hello",
      },
    })
  );
  check(sent.length === 0, "blocked chat ignored");
  store.setSetting("block:106", "0");

  shouldFail = true;
  await handlers["business_message"](
    fakeCtx({
      msg: {
        business_connection_id: "bc1",
        chat: { id: 107, type: "private" },
        from: { id: 562 },
        message_id: 15,
        text: "hi",
      },
    })
  );
  check(sent.some((m) => m.chatId === 999 && m.text.includes("AI call failed")), "AI failure reported to owner");
  check(!sent.some((m) => m.chatId === 107), "nothing sent on AI failure");
  shouldFail = false;

  await handlers.command.get("stats")(fakeCtx({ chatId: 999 }));
  check(sent.some((m) => m.text.includes("Incoming DMs")), "/stats works");
  sent.length = 0;
  await handlers.command.get("mode")(fakeCtx({ chatId: 999, match: "auto" }));
  check(store.getSetting("mode", "draft") === "auto", "/mode auto persists");
  await handlers.command.get("mode")(fakeCtx({ chatId: 999, match: "draft" }));
  check(store.getSetting("mode", "draft") === "draft", "/mode draft persists");
  await handlers.command.get("pause")(fakeCtx({ chatId: 999 }));
  check(store.getSetting("paused", "0") === "1", "/pause works");
  await handlers.command.get("resume")(fakeCtx({ chatId: 999 }));
  check(store.getSetting("paused", "0") === "0", "/resume works");
  await handlers.command.get("block")(fakeCtx({ chatId: 999, match: "200" }));
  check(store.getSetting("block:200", "0") === "1", "/block works");
  await handlers.command.get("unblock")(fakeCtx({ chatId: 999, match: "200" }));
  check(store.getSetting("block:200", "0") === "0", "/unblock works");
  await handlers.command.get("kb")(fakeCtx({ chatId: 999 }));
  check(sent.some((m) => m.text.includes("Current knowledge base")), "/kb works");

  sent.length = 0;
  await handlers["business_message"](
    fakeCtx({
      msg: {
        business_connection_id: "bc1",
        chat: { id: 500, type: "group" },
        from: { id: 570 },
        message_id: 16,
        text: "hi",
      },
    })
  );
  check(sent.length === 0, "group chat ignored");

  nextReply = "Regenerated answer!";
  await handlers["business_message"](
    fakeCtx({
      msg: {
        business_connection_id: "bc1",
        chat: { id: 108, type: "private" },
        from: { id: 571 },
        message_id: 17,
        text: "tell me more",
      },
    })
  );
  const d4 = store.pendingDraft("bc1", 108, 17);
  await handlers.callback.get("^r:(\\d+)$")(fakeCtx({ match: ["r:" + d4.id, String(d4.id)] }));
  check(store.getDraft(d4.id).text === "Regenerated answer!", "regenerate replaced draft");
  check(edited.some((e) => e.text.includes("Regenerated draft")), "regenerate updates owner message");

  console.log("");
  console.log(failures === 0 ? "ALL E2E CHECKS PASSED" : failures + " CHECK(S) FAILED");
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HARNESS ERROR", e);
  process.exit(2);
});
