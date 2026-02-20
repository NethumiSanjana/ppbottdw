require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID; // your bot application id
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId || !guildId) {
  console.log("❌ Missing DISCORD_TOKEN / DISCORD_CLIENT_ID / DISCORD_GUILD_ID in .env");
  process.exit(1);
}

const command = new SlashCommandBuilder()
  .setName("pastpapers")
  .setDescription("Open Past Paper Bot menu (DM only)");

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log("⏳ Registering /pastpapers command...");
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: [command.toJSON()]
    });
    console.log("✅ Registered /pastpapers successfully!");
  } catch (err) {
    console.error("❌ Register failed:", err);
  }
})();