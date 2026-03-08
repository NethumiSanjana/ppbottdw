const express = require("express");
require("dotenv").config();

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
    res.send("PastPaper Platform is alive");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
const handleMessage = require("./core/messageHandler");

app.get("/test", async (req, res) => {
    const action = req.query.action || "/start";
    const reply = await handleMessage(action, "tester", "web");
    res.json(reply);
});
require("./platforms/telegram");

if (process.env.ENABLE_WA === "true") {
  require("./platforms/discord");
}

if (process.env.ENABLE_WA === "true") {
  require("./platforms/whatsapp");
}
