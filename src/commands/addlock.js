/**
 * DOSK BOT — /addlock — حماية الإضافة ومنع الأعضاء غير المصرح بهم
 */
"use strict";

const addLockStore = require("../utils/addLockStore");

function getConfig(tid) {
  const all = addLockStore.load();
  return { all, lock: all[tid] || { enabled: false, accounts: [] } };
}

async function reconcile(api, tid, added = []) {
  const { lock } = getConfig(String(tid));
  if (!lock.enabled || !api || typeof api.removeUserFromGroup !== "function") return { removed: [], skipped: true };
  const allowed = new Set((lock.accounts || []).map(String));
  const removed = [];
  for (const uid of added.map(String)) {
    if (!/^\d+$/.test(uid) || allowed.has(uid)) continue;
    try {
      await new Promise((resolve, reject) => api.removeUserFromGroup(uid, String(tid), err => err ? reject(err) : resolve()));
      removed.push(uid);
    } catch (err) {
      console.error("[AddLock] Unable to remove unauthorized participant", uid, err?.message || err);
    }
  }
  return { removed, skipped: false };
}

module.exports = {
  config: {
    name: "addlock",
    aliases: ["lockadd", "قفل_الاضافة", "حماية_الاعضاء"],
    version: "2.1",
    author: "DOSK",
    countDown: 3,
    role: 2,
    category: "protection",
    description: "منع إضافة أعضاء جدد إلا للحسابات المصرح بها",
    guide: { en: "/addlock on | off | allow <uid> | deny <uid> | status" }
  },
  onStart: async function({ event, args, message }) {
    const tid = String(event.threadID);
    const sub = String(args[0] || "status").toLowerCase();
    const { all, lock } = getConfig(tid);
    lock.accounts = Array.isArray(lock.accounts) ? lock.accounts.map(String) : [];
    if (sub === "on" || sub === "تفعيل") {
      lock.enabled = true;
      all[tid] = lock; addLockStore.save(all);
      return message.reply("🛡️ تم تفعيل AddLock. الإضافات الجديدة غير المصرح بها ستُرفض إذا كانت واجهة الحساب تدعم إزالة العضو.");
    }
    if (sub === "off" || sub === "تعطيل") {
      lock.enabled = false; all[tid] = lock; addLockStore.save(all);
      return message.reply("✅ تم إيقاف AddLock.");
    }
    if (sub === "allow" || sub === "deny") {
      const uid = String(args[1] || "").trim();
      if (!/^\d+$/.test(uid)) return message.reply("❌ استخدم: /addlock allow <uid> أو /addlock deny <uid>");
      if (sub === "allow" && !lock.accounts.includes(uid)) lock.accounts.push(uid);
      if (sub === "deny") lock.accounts = lock.accounts.filter(x => x !== uid);
      all[tid] = lock; addLockStore.save(all);
      return message.reply(sub === "allow" ? "✅ تمت إضافة الحساب للقائمة المسموحة." : "✅ تمت إزالة الحساب من القائمة المسموحة.");
    }
    return message.reply(`🛡️ AddLock: ${lock.enabled ? "مفعل" : "معطل"}\n👥 الحسابات المسموحة: ${lock.accounts.length}\nالأوامر: on / off / allow <uid> / deny <uid>`);
  },
  onEvent: async function({ api, event }) {
    const tid = String(event?.threadID || "");
    if (!tid || event?.logMessageType !== "log:subscribe") return;
    const data = event.logMessageData || {};
    const added = Array.isArray(data.addedParticipants) ? data.addedParticipants.map(x => x.userFbId || x.id).filter(Boolean) : [];
    if (added.length) await reconcile(api, tid, added);
  },
  reconcile
};
