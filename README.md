# Telegram AI Secretary

An AI bot that answers the DMs of a **Telegram Business account on your behalf**, in your voice, using **Secretary Mode** (Telegram Business bots).

The trust model is the whole product: **the AI never invents facts.** It answers only from a knowledge document you control. Every reply is a draft you can approve, edit, regenerate, or discard with one tap — or, when you trust it, switch to auto mode and it answers immediately and logs everything to you.

Built for the person who loses money in DMs: creators, course sellers, community admins, and small businesses whose customers ask "how much?" and "are you available?" at 2am and never get an answer.

## What it does

- Connects to a Telegram **Business account** via BotFather → Business Mode.
- Reads incoming customer DMs and drafts a reply using any OpenAI-compatible model (OpenAI, OpenRouter, a local gateway — set `OPENAI_BASE_URL`).
- Answers **only** from `data/kb.md`, your knowledge document. If a fact is not in there, it says so and hands the conversation to you instead of guessing.
- **Draft mode (default):** every draft lands in your DM with the customer's message and four buttons — Approve & send, Edit, Regenerate, Discard. Nothing reaches a customer without you.
- **Auto mode:** replies are sent immediately and a copy is logged to you. The AI can also flag `needs_human` to escalate instead of answering.
- Remembers the last N messages of each conversation for context.
- `/pause`, `/block`, `/stats`, `/kb`, `/mode` owner commands.
- Persists everything to a local JSON file. No external database to run.

## Prerequisites

1. **A Telegram Business subscription** on the account whose DMs you want answered. Business Mode is a Telegram Premium/Business feature. This is Telegram's requirement, not this project's.
2. **A bot token** from [@BotFather](https://t.me/BotFather) — free.
3. **An OpenAI-compatible API key.** OpenAI works; OpenRouter works; anything exposing `/v1/chat/completions` works.
4. **Your Telegram user ID.** Message [@userinfobot](https://t.me/userinfobot) to get it.
5. **Node.js 18+**, or Docker.

## Setup (5 minutes)

```bash
git clone https://github.com/cactus1382/telegram-ai-secretary.git
cd telegram-ai-secretary
cp .env.example .env
npm install
```

Edit `.env`:

```bash
BOT_TOKEN=123456:AAE...          # from @BotFather
OPENAI_API_KEY=sk-...            # or an OpenRouter key
OPENAI_BASE_URL=                 # e.g. https://openrouter.ai/api/v1 (blank = OpenAI)
MODEL=gpt-4o-mini                # any chat model your provider serves
OWNER_CHAT_ID=123456789          # your user ID, from @userinfobot
MODE=draft                       # draft = approve every reply; auto = answer immediately
```

Put your FAQ, prices, hours, tone, and policies in `data/kb.md`. **That file is the product.** The bot cannot answer well without it, and cannot answer wrong with it.

```bash
npm start
```

Without `WEBHOOK_URL` it runs in long-polling mode — no domain, no Nginx, no SSL needed. With a public domain, set `WEBHOOK_URL=https://your.domain` and it switches to webhooks.

### Connect your business account

1. In Telegram, open the account whose DMs you want answered.
2. Go to **Settings → Business → Bots → connect**.
3. Pick your bot.
4. The bot messages you: `Business account connected. can_reply = true`.
5. DM that account from another account. You should get a draft back within seconds.

If `can_reply = false`, the connection was made without reply rights. Reconnect and grant the bot permission to reply.

## Run with Docker

```bash
cp .env.example .env   # fill it in
docker compose up -d --build
docker compose logs -f
```

The `data/` directory is mounted, so your knowledge base and history survive restarts. Behind Nginx, `proxy_pass` to port 3000 and set `WEBHOOK_URL` to the public HTTPS URL.

## Commands (owner only)

| Command | What it does |
|---|---|
| `/mode draft\|auto` | Draft = every reply needs your approval. Auto = answers sent immediately, logged to you. |
| `/kb` | Show the knowledge base the bot answers from. |
| `/stats` | DMs handled, replies sent, drafts approved/discarded. |
| `/pause` `/resume` | Stop and start answering. |
| `/block <chat_id>` `/unblock <chat_id>` | Never answer a chat again. |

Only `OWNER_CHAT_ID` can use these.

## Project layout

```
.
├── src/
│   ├── index.js        # webhook/polling server + bot bootstrap
│   ├── secretary.js    # the core: business updates, drafts, approvals, commands
│   ├── prompts.js      # the system prompt that grounds replies in kb.md
│   └── db.js           # zero-dependency JSON persistence
├── data/
│   ├── kb.md           # YOUR knowledge base — edit this
│   └── kb_demo.md      # the worked example below, as a starting point
├── test/e2e.js         # 40 assertions covering the whole message flow
├── .env.example
├── Dockerfile
└── docker-compose.yml
```

## Tests

```bash
npm test
```

40 assertions cover: connection handling, draft creation, nothing-sent-without-approval, approve/edit/regenerate/discard, escalation on uncertain replies, auto mode, pause, block list, AI failure fallback, and every owner command.

## Honest limitations

- It answers **text DMs only**. Stickers, photos, and voice arrive as a notice telling you to answer yourself.
- It handles **private chats only**. Group chats are ignored.
- The knowledge base is a flat markdown file. There is no vector search, no fine-tuning, no per-user memory beyond the recent conversation window.
- One business account per instance. Run another container for another account.
- Telegram bills the Business subscription. This project does not.

## License

MIT — see [LICENSE.txt](LICENSE.txt).
