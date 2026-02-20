const route = require("./router");

async function handleMessage(text, userId, platform) {
  // you can log if you want
  // console.log(`[${platform}] ${userId}: ${text}`);
  return route(text);
}

module.exports = handleMessage;