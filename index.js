require("dotenv").config();
const axios = require("axios");
const cheerio = require("cheerio");

const webhookUrl = process.env.SLACK_WEBHOOK_URL;

const fourHours = 4 * 60 * 60 * 1000;

let previousData = null;
let isRunning = false;
let notifyTimer = null;

async function sendSlackMessage(message) {
  if (!webhookUrl) return;

  try {
    await axios.post(webhookUrl, {
      text: message,
    });

    console.log("Slack message sent.");
  } catch (err) {
    console.error("Failed to send Slack message:", err.message);
  }
}

async function scrapePage(url) {
  const { data: html } = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36",
    },
  });

  const $ = cheerio.load(html);

  const coupons = $(".coupon-title")
    .map((_, el) => $(el).text().trim())
    .get();

  const couponCodes = $(".coupon-code")
    .map((_, el) => $(el).text().trim())
    .get();

  return coupons.map((coupon, i) => ({
    coupon,
    code: couponCodes[i] || null,
  }));
}

function computeHash(data) {
  return JSON.stringify(data);
}

async function monitorChanges(url) {
  if (isRunning) return;

  isRunning = true;

  try {
    const data = await scrapePage(url);

    if (!previousData) {
      previousData = data;
      console.log("Initial snapshot saved.");
      return;
    }

    const previousHash = computeHash(previousData);
    const currentHash = computeHash(data);

    if (currentHash !== previousHash) {
      console.log("Data has changed!");

      // Update the snapshot immediately
      previousData = data;

      // Restart the notification timer
      if (notifyTimer) {
        clearTimeout(notifyTimer);
        console.log("Another change detected. Resetting notification timer...");
      }

      notifyTimer = setTimeout(async () => {
        console.log("Sending one notification after changes settled.");
        await sendSlackMessage("🚨 Coupon page has updated!");
        notifyTimer = null;
      }, 10000); // Wait 10 seconds after the last detected change
    } else {
      console.log("No changes.");
    }
  } catch (err) {
    console.error(err);
  } finally {
    isRunning = false;
  }
}

// Check every 5 seconds
setInterval(() => {
  monitorChanges(process.env.URL);
}, fourHours);

// Run immediately on startup
monitorChanges(process.env.URL);
