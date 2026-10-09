/**
 * Pure-JS persistent store (zero native dependencies).
 *
 * Deliberate choice: this is a self-host template that must `npm install`
 * cleanly on a laptop with no compiler. A single business owner's DM volume
 * is tiny, so a JSON file with atomic writes is the right tool, not SQLite.
 */

const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  connections: [],
  messages: [],
  drafts: [],
  settings: {},
  seq: { drafts: 0, messages: 0 },
};

class Store {
  constructor(dbPath) {
    this.dbPath = dbPath;
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.dbPath, "utf8");
      const parsed = JSON.parse(raw);
      this.data = { ...structuredClone(DEFAULTS), ...parsed };
      this.data.settings = parsed.settings || {};
    } catch (err) {
      this.data = structuredClone(DEFAULTS);
    }
  }

  _save() {
    const tmp = this.dbPath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.dbPath);
  }

  // ---- connections ----
  upsertConnection(c) {
    const list = this.data.connections;
    const i = list.findIndex((x) => x.business_connection_id === c.business_connection_id);
    if (i >= 0) {
      list[i] = { ...list[i], ...c };
    } else {
      list.push(c);
    }
    this._save();
  }

  getConnection(id) {
    return this.data.connections.find((c) => c.business_connection_id === id);
  }

  anyConnection() {
    return this.data.connections.find((c) => c.enabled === 1 || c.enabled === true);
  }

  // ---- messages ----
  addMessage(m) {
    m.id = ++this.data.seq.messages;
    this.data.messages.push(m);
    this._save();
    return m.id;
  }

  history(connectionId, chatId, limit) {
    return this.data.messages
      .filter((m) => m.connection_id === connectionId && m.chat_id === chatId)
      .slice(-limit);
  }

  // ---- drafts ----
  createDraft(d) {
    d.id = ++this.data.seq.drafts;
    d.status = d.status || "pending";
    this.data.drafts.push(d);
    this._save();
    return d.id;
  }

  getDraft(id) {
    return this.data.drafts.find((d) => d.id === id);
  }

  setDraftText(id, text) {
    const d = this.getDraft(id);
    if (d) {
      d.text = text;
      this._save();
    }
  }

  setDraftStatus(id, status) {
    const d = this.getDraft(id);
    if (d) {
      d.status = status;
      this._save();
    }
  }

  pendingDraft(connectionId, chatId, msgId) {
    return this.data.drafts
      .filter((d) => d.connection_id === connectionId && d.chat_id === chatId && d.msg_id === msgId && d.status === "pending")
      .pop();
  }

  // ---- settings ----
  setSetting(key, value) {
    this.data.settings[key] = String(value);
    this._save();
  }

  getSetting(key, fallback) {
    const v = this.data.settings[key];
    return v === undefined ? fallback : v;
  }

  stats() {
    return {
      drafts: this.data.drafts.length,
      sent: this.data.drafts.filter((d) => d.status === "sent").length,
      discarded: this.data.drafts.filter((d) => d.status === "discarded").length,
      incoming: this.data.messages.filter((m) => m.role === "user").length,
      outgoing: this.data.messages.filter((m) => m.role === "assistant").length,
    };
  }

  close() {
    this._save();
  }
}

module.exports = { Store };
