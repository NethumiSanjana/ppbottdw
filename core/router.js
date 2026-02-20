const fs = require("fs");
const path = require("path");

// Load menu + messages + papers (papers can be empty for now)
const menu = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../database/menu.json"), "utf8")
);

let messages = {};
try {
  messages = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../database/messages.json"), "utf8")
  );
} catch (e) {
  messages = {};
}

let papers = {};
try {
  papers = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../database/papers.json"), "utf8")
  );
} catch (e) {
  papers = {};
}

function route(input) {
  const text = (input || "").toString().trim();

  // /start -> start menu
  if (!text || text === "/start" || text === "start") {
    return menu["start"] || {
      text: "Menu not found (start)",
      buttons: []
    };
  }

  // If input is exactly a page/action id
  if (menu[text]) {
    return menu[text];
  }

  // If it is a paper action from menu.json
  // Format: paper:SOMETHING
  if (text.startsWith("paper:")) {
    const key = text.replace("paper:", "").trim();
    const files = papers[key];

    if (!files || !Array.isArray(files) || files.length === 0) {
      return {
        type: "text",
        text:
          messages.notFoundPPMsg ||
          "මෙම වර්ෂයට Paper එක හමු නොවීය 😕\nවෙනත් වර්ෂයක් තෝරන්න ✅"
      };
    }

    return {
      type: "papers",
      key,
      files
    };
  }

  // If user sent a BUTTON LABEL (Reply Keyboard sends label text)
  // Find matching label in ANY menu and use its action
  for (const pageKey in menu) {
    const page = menu[pageKey];
    const match = page.buttons?.find(
      (b) => (b.label || "").toString() === text
    );
    if (match) {
      const action = match.action;

      // if action points to a menu page
      if (menu[action]) return menu[action];

      // if action is paper:
      if (typeof action === "string" && action.startsWith("paper:")) {
        const key = action.replace("paper:", "").trim();
        const files = papers[key];

        if (!files || !Array.isArray(files) || files.length === 0) {
          return {
            type: "text",
            text:
              messages.notFoundPPMsg ||
              "මෙම වර්ෂයට Paper එක හමු නොවීය 😕\nවෙනත් වර්ෂයක් තෝරන්න ✅"
          };
        }

        return {
          type: "papers",
          key,
          files
        };
      }

      // if action is unknown
      return {
        type: "text",
        text:
          messages.unknownOption ||
          "මෙය හඳුනාගත නොහැකි විකල්පයක් 😅\nකරුණාකර මෙනුවෙන් තෝරන්න ✅"
      };
    }
  }

  // Fallback
  return {
    type: "text",
    text:
      messages.unknownOption ||
      "මෙය හඳුනාගත නොහැකි විකල්පයක් 😅\nකරුණාකර මෙනුවෙන් තෝරන්න ✅"
  };
}

module.exports = route;