const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  MessageFlags
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
require("dotenv").config();

const handleMessage = require("../core/messageHandler");

if (!process.env.DISCORD_TOKEN) {
  console.log("❌ DISCORD_TOKEN missing in .env");
  process.exit(1);
}
if (!process.env.DISCORD_GUILD_ID) {
  console.log("❌ DISCORD_GUILD_ID missing in .env");
  process.exit(1);
}

const menu = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../database/menu.json"), "utf8")
);

const PLACEHOLDER =
  "https://github.com/SL-Real-Tech/Files/raw/main/Past-Papers/notfound.pdf";

// ---------- helpers
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

// Convert action -> label (so router keeps working using labels)
function labelFromAction(action) {
  for (const pageKey in menu) {
    const page = menu[pageKey];
    const btn = page.buttons?.find((b) => b.action === action);
    if (btn) return btn.label;
  }
  return null;
}

// Build ONLY BUTTONS (no dropdown). Discord limit: 5 buttons per row, 5 rows (25)
function buildButtonRows(buttons = []) {
  const rows = [];
  const MAX = Math.min(buttons.length, 25);

  for (let i = 0; i < MAX; i += 5) {
    const row = new ActionRowBuilder();
    const slice = buttons.slice(i, i + 5);

    slice.forEach((b, idx) => {
      // Prefer action (short + stable). fallback label.
      const idKey = b.action || b.label;

      // Color style mapping
      const styles = [
        ButtonStyle.Primary,
        ButtonStyle.Success
      ];
      const style = styles[idx % styles.length];

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`menu_action:${idKey}`) // ✅ action-based id
          .setLabel((b.label || "Button").slice(0, 80))
          .setStyle(style)
      );
    });

    rows.push(row);
  }

  return rows;
}

function buildChannelStartButton() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("start_dm")
        .setLabel("ආරම්භ කරන්න ✅")
        .setStyle(ButtonStyle.Success)
    )
  ];
}

async function sendMenuDM(user, pageKey = "start", overrideText = null) {
  const page = menu[pageKey] || menu["start"];
  const content = overrideText || page.text || "✅";
  const components = buildButtonRows(page.buttons || []);

  await user.send({
    content,
    components,
    flags: MessageFlags.SuppressEmbeds // ✅ disable link previews
  });
}

async function sendPapersDM(user, files) {
  for (const f of files) {
    const url = typeof f === "string" ? f : f.url;
    const name = typeof f === "string" ? "paper.pdf" : (f.name || "paper.pdf");

    if (!url) continue;

    if (isPlaceholder(url)) {
      await sendMenuDM(user, "start", "⚠️ මෙම Paper එක තවම Upload කරලා නැහැ 😕");
      return;
    }

    try {
      const tmp = makeTmpFileName(".pdf");
      await downloadToFile(url, tmp);
      await user.send({ files: [{ attachment: tmp, name }] });
      try { fs.unlinkSync(tmp); } catch (_) {}
    } catch (e) {
      await sendMenuDM(
        user,
        "start",
        "⚠️ Paper එක යවන්න බැරි වුණා 😕\nපසුව නැවත උත්සාහ කරන්න."
      );
      return;
    }
  }

  await sendMenuDM(user, "start", "✅ Paper(s) Sent.\nවෙනත් වර්ෂයක් තෝරන්න 🔽");
}

// ---------- client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

client.once(Events.ClientReady, () => {
  console.log(`✅ Discord bot ready as ${client.user.tag}`);
});

// ---------- interactions
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // 1) Slash command /pastpapers -> posts channel start button
    if (interaction.isChatInputCommand() && interaction.commandName === "pastpapers") {
      if (!interaction.guild || interaction.guild.id !== process.env.DISCORD_GUILD_ID) {
        return interaction.reply({ content: "❌ Wrong server.", ephemeral: true });
      }

      await interaction.reply({
        content:
          "📚 **Past Paper Bot**\nDM වලින් papers එනවා.\nපහළ බොත්තම ඔබලා ආරම්භ කරන්න 👇",
        components: buildChannelStartButton(),
        flags: MessageFlags.SuppressEmbeds // ✅ disable embeds in channel too
      });

      return;
    }

    // 2) Channel button "start_dm" -> DM menu
    if (interaction.isButton() && interaction.customId === "start_dm") {
      const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
      const member = await guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        return interaction.reply({
          content: "❌ Server එකට join වෙලා පස්සේ Start කරන්න.",
          ephemeral: true
        });
      }

      // DM open check
      try {
        await interaction.user.send({
          content: "✅ Past Paper Bot Start වුණා!",
          flags: MessageFlags.SuppressEmbeds
        });
      } catch (e) {
        return interaction.reply({
          content:
            "❌ DM Off 😕\nServer privacy settings වලින් DMs enable කරලා නැවත try කරන්න.",
          ephemeral: true
        });
      }

      await interaction.reply({ content: "✅ Check your DM 😄", ephemeral: true });
      await sendMenuDM(interaction.user, "start");
      return;
    }

    // 3) DM menu button clicks (action-based)
    if (interaction.isButton() && interaction.customId.startsWith("menu_action:")) {
      const action = interaction.customId.slice("menu_action:".length);

      // Convert action -> label so your router stays unchanged
      const label = labelFromAction(action) || action;

      const reply = await handleMessage(label, interaction.user.id, "discord");

      await interaction.deferUpdate();

      if (reply?.type === "papers") {
        await sendPapersDM(interaction.user, reply.files || []);
        return;
      }

      const content = reply?.text || "✅";
      const components = buildButtonRows(reply?.buttons || []);

      await interaction.editReply({
        content,
        components,
        flags: MessageFlags.SuppressEmbeds // ✅ disable embeds in edited messages too
      });
      return;
    }
  } catch (e) {
    if (interaction.deferred || interaction.replied) {
      try {
        await interaction.followUp({ content: "❌ Error 😕 Try again.", ephemeral: true });
      } catch (_) {}
    } else {
      try {
        await interaction.reply({ content: "❌ Error 😕 Try again.", ephemeral: true });
      } catch (_) {}
    }
  }
});

client.login(process.env.DISCORD_TOKEN);