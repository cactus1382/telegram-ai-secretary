# DEMO SCRIPT — 60-second screen capture

Read this word-for-word while recording. Two Telegram accounts open: your **business account** (the one customers DM) on the left, your **owner account** (where drafts arrive) on the right. Phone or desktop, both work.

**Setup before you hit record:**
1. `data/kb.md` = the restaurant demo file (copy `data/kb_demo.md` over it).
2. `MODE=draft` in `.env`, bot running.
3. Both chats scrolled to the bottom, keyboard out of frame.
4. Three DMs pre-typed in the customer account, ready to send. Do not type live — typing eats the whole 60 seconds.

---

**[0:00 — 0:08] Show the problem**

*(Customer account, left screen. Send DM #1.)*

> "This is my business account. Someone just DM'd me a price question at midnight."

**DM #1:** `Hi, how much is the Chicken Sultani?`

**[0:08 — 0:22] The draft arrives**

*(Switch to owner account, right screen. The draft appears while you talk.)*

> "The bot reads the DM and drafts a reply — but it doesn't send it. The draft comes to *me* first, with the price it pulled from my FAQ file."

*(Read the draft text on screen. Tap **Approve & send**.)*

> "One tap, and it's sent *as my business account*. No 'via bot' label."

**[0:22 — 0:34] The escalation — this is the whole product**

*(Customer account. Send DM #2.)*

**DM #2:** `Do you cater for 80 people next Friday?`

*(Switch to owner account.)*

> "Now I ask it something that isn't in my FAQ. Watch — it doesn't guess."

*(The escalation message appears: 'needs you personally'.)*

> "It hands it to me. It will never invent a price or a promise I didn't write down. That's why I trust it with my customers."

**[0:34 — 0:46] Auto mode**

*(Send the command `/mode auto` from the owner account.)*

> "When I trust it, I switch to auto mode."

*(Customer account. Send DM #3.)*

**DM #3:** `What time do you deliver?`

*(The reply appears in the customer chat within seconds.)*

> "Now it answers instantly — and I still get a copy of every reply."

**[0:46 — 0:60] Close**

*(Owner account, tap `/stats`.)*

> "Every reply, logged. If you lose customers to unanswered DMs, the link is below — $79, self-host, and it takes an evening to set up."

---

## The three DMs, exactly

1. `Hi, how much is the Chicken Sultani?` → answered from the FAQ (240,000 Toman)
2. `Do you cater for 80 people next Friday?` → escalated, not in the FAQ (the kb says orders over 20 portions need a call — the bot should escalate, not quote)
3. `What time do you deliver?` → answered from the FAQ (18:00–22:00)

## Recording rules

- **Do not type live.** Pre-write all three DMs and just hit send.
- If a draft takes more than a few seconds, edit that beat out. The video doesn't need to prove the latency.
- Film in one take. If you mess up a line, redo the whole thing — 60 seconds is short enough that a second take costs you nothing.
- Show the bot's reply actually arriving in the **customer's** chat. That's the moment people buy. If the viewer only sees your owner chat, they don't believe it works.
- No music, no captions. Your voice and the two screens are enough.

## If something goes wrong on camera

- **Draft doesn't arrive:** the bot isn't connected. Check `can_reply = true` came through in your owner chat, and that the customer account isn't your own business account.
- **Bot answers DM #2 with a made-up catering price:** your kb.md doesn't clearly exclude catering. Add "We do not cater large events" to the demo file and re-record. This is the one failure that would mislead a buyer — do not post the video if it happens.
- **The reply looks like a bot:** regenerate once. If it still sounds robotic, add a line to the tone section of kb.md: "Write like you're texting a friend, not emailing a company."
