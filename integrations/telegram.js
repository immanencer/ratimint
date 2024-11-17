import 'dotenv/config';

import Telegraf from 'telegraf';
import MongoClient from 'mongodb';


const botToken = process.env.BOT_TOKEN;
const mongoUri = process.env.MONGO_URI;
if (!botToken || !mongoUri) {
  console.error('Please provide BOT_TOKEN and MONGO_URI in your .env file');
  process.exit(1);
}

const bot = new Telegraf(botToken);
let db, messageQueue;

// Connect to MongoDB
MongoClient.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then((client) => {
    db = client.db('telegramBot');
    messageQueue = db.collection('messageQueue');
    console.log('Connected to MongoDB');
    processMessages();
  })
  .catch((error) => {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  });

bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const message = ctx.message.text;

  // Add message to the queue
  try {
    await messageQueue.insertOne({ chatId, message, processed: false });
  } catch (error) {
    console.error('Failed to add message to the queue:', error);
  }
});

// Function to process messages from the queue
const processMessages = async () => {
  try {
    setInterval(async () => {
      const messageJob = await messageQueue.findOneAndUpdate(
        { processed: false },
        { $set: { processed: true } }
      );

      if (messageJob.value) {
        const { chatId, message } = messageJob.value;

        // Simple response handler
        try {
          await bot.telegram.sendMessage(chatId, `You said: ${message}`);
        } catch (error) {
          console.error(`Failed to send message to chat ${chatId}:`, error);
        }
      }
    }, 1000); // Process messages every second
  } catch (error) {
    console.error('Failed to process messages from the queue:', error);
  }
};

// Handle bot connection carefully
bot.launch().then(() => {
  console.log('Bot launched successfully!');
}).catch((error) => {
  console.error('Bot failed to launch:', error);
  process.exit(1);
});

// Graceful stop on signal termination
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
