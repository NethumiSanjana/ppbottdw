const TelegramBot = require("node-telegram-bot-api");
const handleMessage = require("../core/messageHandler");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
require("dotenv").config();

if (!process.env.TG_TOKEN) {
  console.log("❌ TG_TOKEN missing in .env");
  process.exit(1);
}

const bot = new TelegramBot(process.env.TG_TOKEN, { polling: true });

const menu = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../database/menu.json"), "utf8")
);

const PLACEHOLDER =
  "https://github.com/SL-Real-Tech/Files/raw/main/Past-Papers/notfound.pdf";

// --- helpers
function keyboardFromButtons(buttons = []) {
  return {
    reply_markup: {
      keyboard: buttons.map((b) => [{ text: b.label }]),
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
}

function findMenuPageByLabel(label) {
  for (const pageKey in menu) {
    const page = menu[pageKey];
    const match = page.buttons?.find((b) => b.label === label);
    if (match) return pageKey;
  }
  return "start";
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function makeTmpFileName(ext = ".pdf") {
  const id = crypto.randomBytes(8).toString("hex");
  return path.join(os.tmpdir(), `pastpaper-${id}${ext}`);
}

function isPlaceholder(url) {
  return (url || "").trim() === PLACEHOLDER;
}

// Download using Node 18+ built-in fetch
async function downloadToFile(url, filepath) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);

  const arrayBuf = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  fs.writeFileSync(filepath, buf);
  return filepath;
}

async function safeSendMessage(chatId, text, buttons) {
  try {
    return await bot.sendMessage(chatId, text, keyboardFromButtons(buttons || []));
  } catch (e) {
    // last resort: send without keyboard
    return bot.sendMessage(chatId, text);
  }
}

/**
 * Try send by URL first, then fallback download+upload.
 * Returns true if sent, false if failed.
 */
async function sendOnePaper(chatId, fileObj) {
  const url = typeof fileObj === "string" ? fileObj : fileObj.url;
  const filename =
    typeof fileObj === "string"
      ? "paper.pdf"
      : fileObj.name || "paper.pdf";

  if (!url) return false;

  // If placeholder -> treat as "not available"
  if (isPlaceholder(url)) {
    return { ok: false, reason: "NOTFOUND" };
  }

  // 1) Try direct URL send
  try {
    await bot.sendDocument(chatId, url, {}, { filename });
    return { ok: true, method: "url" };
  } catch (err1) {
    // 2) Fallback: download then upload
    try {
      const tmp = makeTmpFileName(".pdf");
      await downloadToFile(url, tmp);
      await bot.sendDocument(chatId, tmp, {}, { filename });
      // cleanup
      try { fs.unlinkSync(tmp); } catch (_) {}
      return { ok: true, method: "download" };
    } catch (err2) {
      return { ok: false, reason: "SEND_FAIL", err1, err2 };
    }
  }
}

// ---- main handler
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : "";
  if (!text) return;

  const input = text.startsWith("/start") ? "/start" : text;

  // figure the page we should keep user in (based on what they clicked)
  const keepPageKey =
    input === "/start" ? "start" : findMenuPageByLabel(text);
  const keepPage = menu[keepPageKey] || menu["start"] || { buttons: [] };

  let reply;
  try {
    reply = await handleMessage(input, chatId, "telegram");
  } catch (e) {
    return safeSendMessage(
      chatId,
      "❌ Bot error 😕\nපසුව නැවත උත්සාහ කරන්න.",
      keepPage.buttons
    );
  }

  // ✅ Paper response
  if (reply && reply.type === "papers") {
    let sentCount = 0;

    for (const f of reply.files || []) {
      const result = await sendOnePaper(chatId, f);

      if (result.ok) {
        sentCount++;
        await wait(600);
        continue;
      }

      // if placeholder / not found
      if (result.reason === "NOTFOUND") {
        await safeSendMessage(
          chatId,
          "⚠️ මෙම Paper එක තවම Upload කරලා නැහැ 😕\nවෙනත් වර්ෂයක් තෝරන්න ✅",
          keepPage.buttons
        );
        // Stop further sending (because it's just notfound)
        return;
      }

      // real failure
      await safeSendMessage(
        chatId,
        "⚠️ Paper එක යවන්න බැරි වුණා 😕\nLink එක වැඩ නෑ වගේ.\nපසුව නැවත උත්සාහ කරන්න ✅",
        keepPage.buttons
      );
      return;
    }

    // If at least one sent, show success and keep menu
    if (sentCount > 0) {
      return safeSendMessage(
        chatId,
        "✅ Paper(s) Sent.\nවෙනත් වර්ෂයක් තෝරන්න 🔽",
        keepPage.buttons
      );
    }

    // if nothing sent
    return safeSendMessage(
      chatId,
      "⚠️ Paper list එක හිස් 😕\nවෙනත් option එකක් තෝරන්න ✅",
      keepPage.buttons
    );
  }

  // ✅ Normal menu page
  const outText = reply?.text || "✅";
  const outButtons = reply?.buttons || keepPage.buttons || [];

  return safeSendMessage(chatId, outText, outButtons);
});

console.log("✅ Telegram bot running (URL + fallback download enabled)..");