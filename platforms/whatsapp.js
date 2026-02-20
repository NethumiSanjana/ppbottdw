const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadContentFromMessage
} = require("@whiskeysockets/baileys");

const P = require("pino");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const handleMessage = require("../core/messageHandler");

const PLACEHOLDER =
  "https://github.com/SL-Real-Tech/Files/raw/main/Past-Papers/notfound.pdf";

function makeTmpFileName(ext = ".pdf") {
  const id = crypto.randomBytes(8).toString("hex");
  return path.join(os.tmpdir(), `pastpaper-${id}${ext}`);
}

function isPlaceholder(url) {
  return (url || "").trim() === PLACEHOLDER;
}

async function downloadToFile(url, filepath) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(filepath, buf);
  return filepath;
}

// Build a text menu list for WhatsApp
function menuTextFromButtons(buttons = []) {
  // show numbered list to reduce typing
  // user can reply with number or label
  let out = buttons
    .map((b, i) => `${i + 1}. ${b.label}`)
    .join("\n");
  return out || "✅";
}

function pickLabelFromNumber(text, buttons) {
  const n = parseInt(text.trim(), 10);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > buttons.length) return null;
  return buttons[n - 1].label;
}

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth-wa");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: "silent" })
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) qrcode.generate(qr, { small: true });

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startWhatsApp();
    }

    if (connection === "open") console.log("✅ WhatsApp connected");
  });

  // Load menu.json for numbering support
  const menu = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../database/menu.json"), "utf8")
  );

  // Keep current page per chat in memory (simple session)
  const chatState = new Map(); // chatId -> pageKey

  async function sendMenu(chatId, pageKey, textOverride = null) {
    const page = menu[pageKey] || menu["start"];
    chatState.set(chatId, pageKey);

    const header = textOverride || page.text || "✅";
    const list = menuTextFromButtons(page.buttons || []);
    const tip = "\n\nReply with number (1,2,3...) or button name.\nType .start anytime.";

    await sock.sendMessage(chatId, { text: `${header}\n\n${list}${tip}` });
  }

  async function sendPapers(chatId, files) {
    for (const f of files) {
      const url = typeof f === "string" ? f : f.url;
      const name = typeof f === "string" ? "paper.pdf" : (f.name || "paper.pdf");

      if (!url) continue;

      if (isPlaceholder(url)) {
        await sock.sendMessage(chatId, {
          text: "⚠️ මේ Paper එක තාම Upload කරලා නැහැ 😕"
        });
        return;
      }

      // Try send as document by downloading (WhatsApp needs upload)
      try {
        const tmp = makeTmpFileName(".pdf");
        await downloadToFile(url, tmp);

        const buffer = fs.readFileSync(tmp);
        await sock.sendMessage(chatId, {
          document: buffer,
          mimetype: "application/pdf",
          fileName: name
        });

        try { fs.unlinkSync(tmp); } catch (_) {}
      } catch (e) {
        await sock.sendMessage(chatId, {
          text: "⚠️ Paper එක යවන්න බැරි වුණා 😕\nපස්සේ ආයෙ try කරන්න."
        });
        return;
      }
    }

    // keep user on same menu
    const pageKey = chatState.get(chatId) || "start";
    await sendMenu(chatId, pageKey, "✅ Paper(s) Sent. වෙනත් එකක් තෝරන්න 🔽");
  }

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message) return;
    if (msg.key.fromMe) return;

    const chatId = msg.key.remoteJid;

    // get text
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    const t = (text || "").trim();
    if (!t) return;

    // start command
    if (t === ".start" || t === ".menu" || t === "/start") {
      await sendMenu(chatId, "start");
      return;
    }

    // If we are in a page, allow number selection
    const currentPageKey = chatState.get(chatId) || "start";
    const currentPage = menu[currentPageKey] || menu["start"];
    const buttons = currentPage.buttons || [];

    const labelFromNumber = pickLabelFromNumber(t, buttons);
    const input = labelFromNumber || t;

    // Route
    const reply = await handleMessage(input, chatId, "whatsapp");

    if (reply?.type === "papers") {
      await sendPapers(chatId, reply.files || []);
      return;
    }

    // Normal menu
    // Router returns {text, buttons} for next page
    const outText = reply?.text || "✅";
    const outButtons = reply?.buttons || [];

    // Find the next pageKey by matching buttons (simple way: search menu where buttons match)
    // If your router already returns pageKey, use that instead. For now keep it minimal:
    // We'll set state to start if unknown.
    let nextKey = "start";
    for (const key in menu) {
      const page = menu[key];
      // heuristic: match first label
      if (outButtons?.[0]?.label && page.buttons?.[0]?.label === outButtons[0].label) {
        nextKey = key;
        break;
      }
    }

    // send menu with router outputs (even if key guess is wrong, UX still ok)
    chatState.set(chatId, nextKey);
    const list = menuTextFromButtons(outButtons);
    const tip = "\n\nReply with number or name.\nType .start anytime.";

    await sock.sendMessage(chatId, { text: `${outText}\n\n${list}${tip}` });
  });
}

startWhatsApp();