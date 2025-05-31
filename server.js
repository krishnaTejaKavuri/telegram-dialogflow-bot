const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const dialogflow = require('@google-cloud/dialogflow');
const { v4: uuid } = require('uuid');

const app = express();
app.use(bodyParser.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const PROJECT_ID = process.env.DIALOGFLOW_PROJECT_ID;

const sessionClient = new dialogflow.SessionsClient({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
});

// --- ADD THIS NEW GET ROUTE FOR TESTING ---
app.get('/', (req, res) => {
  console.log('--- GET request received at root ---');
  res.status(200).send('Bot server is running. Send a POST request to this endpoint from Telegram.');
});
// ------------------------------------------

// Main POST endpoint to handle incoming Telegram webhook updates
app.post('/', async (req, res) => {
  // --- IMPORTANT: Send 200 OK immediately to Telegram ---
  res.sendStatus(200); // Acknowledge receipt to Telegram ASAP to prevent retries!
  // --- END IMPORTANT CHANGE ---

  console.log('RECEIVED A REQUEST FROM SOMEWHERE!');
  console.log('--- Incoming Telegram Update ---');
  console.log('Request Body:', JSON.stringify(req.body, null, 2));

  // The rest of the logic can run asynchronously after acknowledging Telegram
  if (!req.body || !req.body.message || !req.body.message.text) {
    console.log('No text message found in the update. Ignoring.');
    return; // Already sent 200, just exit
  }

  try {
    const chatId = req.body.message.chat.id;
    const messageText = req.body.message.text;
    const sessionPath = sessionClient.projectAgentSessionPath(PROJECT_ID, uuid());

    console.log(`Received message from chat ID ${chatId}: "${messageText}"`);
    console.log(`Dialogflow Session Path: ${sessionPath}`);

    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: messageText,
          languageCode: 'en',
        },
      },
    };

    console.log('Sending request to Dialogflow...');
    const responses = await sessionClient.detectIntent(request);
    const result = responses[0].queryResult;

    console.log('Dialogflow Response Received.');
    console.log('Fulfillment Text:', result.fulfillmentText);
    console.log('Intent:', result.intent ? result.intent.displayName : 'No intent detected');

    if (result.fulfillmentText) {
      console.log('Sending response back to Telegram...');
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: chatId,
        text: result.fulfillmentText,
      });
      console.log('Response sent to Telegram successfully.');
    } else {
      console.log('Dialogflow did not provide a fulfillment text. Sending a default message.');
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: chatId,
        text: "I'm sorry, I didn't understand that. Please try again.",
      });
    }

    // Removed res.sendStatus(200) from here as it's sent at the top
  } catch (error) {
    console.error('--- Error in app.post handler ---');
    console.error('Error details:', error);

    const chatId = req.body.message && req.body.message.chat && req.body.message.chat.id;
    if (chatId) {
      try {
        await axios.post(`${TELEGRAM_API}/sendMessage`, {
          chat_id: chatId,
          text: "Oops! Something went wrong on my end. Please try again later.",
        });
      } catch (telegramError) {
        console.error('Failed to send error message to Telegram:', telegramError);
      }
    }
    // Removed res.sendStatus(500) from here as 200 was already sent at the top.
    // Telegram only cares about the first status code received.
  }
});

app.listen(3000, () => {
  console.log('Bot is running on port 3000');
});