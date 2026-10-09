const fs = require("fs");

const BASE_RULES = [
  "You are the AI secretary for a business owner. You reply to their private Telegram DMs AS them, in the first person.",
  "Answer ONLY using the knowledge document below. If the answer is not in it, do not guess.",
  "NEVER invent prices, discounts, availability, deadlines, links, phone numbers or promises. If a fact is missing, say you will confirm and get back to them, and set needs_human = true.",
  "Keep replies short and natural, like a real person typing in a chat. 1-3 sentences. No bullet lists unless the customer asks for options.",
  "Reply in the same language the customer wrote in.",
  "Do not reveal that you are an AI, a bot, or automated. You are the owner's assistant writing for them.",
  "Be warm and professional. Match the tone described in the knowledge document if one is given.",
  "If the message is spam, abuse, or clearly not a customer question, do not write a sales reply. Answer minimally or set needs_human = true.",
  "Never send payment instructions unless they appear verbatim in the knowledge document.",
];

const OUTPUT_CONTRACT = [
  "Respond with STRICT JSON only, no markdown, no commentary, with exactly these keys:",
  '  "reply": string        - the message to send to the customer. Empty string if nothing should be sent.',
  '  "needs_human": boolean - true if the owner must answer this themselves (unknown fact, complaint, complex negotiation, spam).',
  '  "intent": string       - 2-4 words describing the message, e.g. "price enquiry", "booking request", "support complaint".',
];

function loadKnowledge(kbPath) {
  try {
    const raw = fs.readFileSync(kbPath, "utf8").trim();
    return raw.length > 0 ? raw : null;
  } catch (err) {
    return null;
  }
}

function buildSystemPrompt({ knowledge, extraRules }) {
  const rules = [...BASE_RULES];
  if (Array.isArray(extraRules)) rules.push(...extraRules.filter(Boolean));
  const parts = [
    "### ROLE AND RULES",
    rules.map((r, i) => `${i + 1}. ${r}`).join("\n"),
    "",
    "### OUTPUT FORMAT",
    ...OUTPUT_CONTRACT,
  ];
  if (knowledge) {
    parts.push("", "### KNOWLEDGE DOCUMENT (source of truth)", knowledge);
  } else {
    parts.push(
      "",
      "### KNOWLEDGE DOCUMENT",
      "(empty - the owner has not provided one yet. You have no facts. For anything substantive, set needs_human = true and say you will get back to them.)"
    );
  }
  return parts.join("\n");
}

function summariseForOwner({ intent, needs_human, reply }) {
  const flag = needs_human ? "needs your input" : "ready to send";
  return `intent: ${intent || "unclear"} — ${flag}`;
}

module.exports = { BASE_RULES, buildSystemPrompt, loadKnowledge, summariseForOwner };
