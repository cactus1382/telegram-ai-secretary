# Gumroad listing — copy-paste ready

Everything below goes straight into Gumroad. Title into the title field, description into the description field, tags into the tags field.

---

**PRODUCT NAME**

Telegram AI Secretary — Answer Your DMs As You

**PRICE**

$79 (one-time)

**DESCRIPTION**

Your DMs are losing you money.

You posted something, you went to sleep, and by morning there are 14 messages: "how much?", "are you available?", "does it work on iPhone?" Every one of them was a customer who was ready to pay and who messaged two other people while waiting for you. They bought from whoever replied first.

**Telegram AI Secretary** reads the DMs sent to your Telegram Business account and answers them — as you. Customers see your name and your avatar. There is no "sent by a bot" label.

**How it works**

- It connects to your Telegram Business account (Business Mode) and reads incoming DMs.
- It answers **only** from a knowledge document you write — your FAQ, your prices, your hours, your refund policy. If a fact isn't in there, it doesn't guess. It tells you to handle it yourself.
- By default every reply is a **draft**: it comes to you first with the customer's message, and you Approve, Edit, Regenerate, or Discard with one tap. Nothing goes out without you.
- When you trust it, switch to **auto mode** and it answers instantly — and you still get a copy of every reply.
- It answers in whatever language the customer wrote in.
- Works with OpenAI, OpenRouter, or any OpenAI-compatible provider.

**What you get**

- The full source code (Node.js, no build step, no native dependencies).
- A knowledge-base template that's the actual brain of the bot — edit one file and it changes how it answers.
- Docker setup if you want to run it that way; otherwise it runs with `npm install && npm start`.
- A 40-assertion test suite so you can verify it works before you trust it with customers.
- Setup guide and owner commands: `/mode`, `/kb`, `/stats`, `/pause`, `/block`.

**What you need**

- A Telegram Business subscription on the account you want answered. Business Mode is Telegram's paid feature — roughly the price of a Premium plan per month. This is Telegram's requirement, not this project's. **Check you have it before you buy.**
- An OpenAI-compatible API key (OpenAI, OpenRouter, or any gateway).
- Node.js 18+ or Docker.

**Three honest limitations, so you know exactly what you're buying**

1. **It answers text DMs only.** Photos, stickers, and voice messages get a notice telling you to answer them yourself.
2. **It handles private chats only.** Group chats are ignored.
3. **One business account per instance.** Run a second container for a second account.

**Refund policy**

If it doesn't work for you, email me and I'll refund you. I'd rather have the bug report than the money.

**TAGS**

telegram bot, ai assistant, secretary mode, telegram business, customer support, chatbot, automation, solopreneur, creator tools, lead response

---

## After you publish

1. Set the payout method to PayPal or Payoneer before anything else. A listing with no payout path earns nothing.
2. **Test-buy it yourself** with a 100% off code and confirm the zip downloads. Do not post the link anywhere until this works.
3. Zip the `telegram-secretary` folder **without** `node_modules`, `.env`, or the `data/secretary.db` file. Keep `data/kb_demo.md` and `test/e2e.js` in — the test suite is a selling point, not clutter.
4. Put the demo video in the product gallery. It converts more than any description.
