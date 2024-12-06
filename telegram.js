import 'dotenv/config';
import path from 'path';
import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import { uploadMedia, downloadMedia } from './s3imageService.js'; // Add import for S3 upload

/**
 * Initialize the Telegram bot and handle messages.
 * This module is solely responsible for telegram integration,
 *  - listening to messages and logging them to the database,
 *  - replying to messages based on tasks created in the database.
 * 
 * The bot is initialized as a singleton to prevent multiple instances.
 */


const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('Please provide BOT_TOKEN in your .env file');
  process.exit(1);
}

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error('Please provide MONGO_URI in your .env file');
  process.exit(1);
}

const DEBUG_MODE = process.env.DEBUG_MODE === 'true';

const DB_SERVICE_URL = 'http://127.0.0.1:3009';

// Initialize node-telegram-bot-api as a singleton
if (!global.telegramBot) {
  global.telegramBot = new TelegramBot(BOT_TOKEN, {
    polling: {
      autostart: true
    }
  });

  let botUserId = null;

  // Retrieve and store the bot's user ID
  global.telegramBot.getMe().then((me) => {
    botUserId = me.id;
    console.log(`Bot initialized with ID: ${botUserId}`);
  }).catch(error => {
    console.error('Error retrieving bot information:', error);
    process.exit(1);
  });

  // Handle polling errors
  global.telegramBot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
  });

  let firstMessageReceived = false;

  // Log all messages to MongoDB and add a "bot online" task if DEBUG_MODE is enabled
  global.telegramBot.on('message', async (msg) => {
    // Prevent the bot from responding to its own messages
    if (botUserId && msg.from.id === botUserId) {
      return;
    }

    let imageUrl = null;
    let videoUrl = null;

    if (msg.photo) {
      // Get the highest resolution photo
      const photo = msg.photo[msg.photo.length - 2];
      const fileLink = await global.telegramBot.getFileLink(photo.file_id);
      const localPath = path.join('./tmp', `${photo.file_id}.jpg`);
      await downloadMedia(fileLink, localPath); // Download the video
      imageUrl = await uploadMedia(localPath); // Upload to S3 and get S3 URL
      console.log('Image URL:', imageUrl);
    }

    if (msg.video) {
      // Get the video file link
      const video = msg.video;
      const fileLink = await global.telegramBot.getFileLink(video.file_id);
      const localPath = path.join('./tmp', `${video.file_id}.mp4`);
      await downloadMedia(fileLink, localPath); // Download the video
      videoUrl = await uploadMedia(localPath); // Upload to S3 and get S3 URL
      console.log('Video URL:', videoUrl);
    }

    const logEntry = {
      author: msg.from.username || msg.from.id,
      time: msg.date,
      channel: msg.chat.id,
      to: msg.chat.title  || 'private',
      type: msg.chat.type,
      text: msg.text || '',
      imageUrl: imageUrl, // Store S3 URL
      videoUrl: videoUrl  // Store S3 URL
    };

    try {
      await axios.post(`${DB_SERVICE_URL}/message`, logEntry);
    } catch (error) {
      console.error('Error logging message:', error);
    }

    // Handle AI-generated messages if applicable
    // Ensure AI messages are logged with the correct format

    // Create a "bot online" task for the first message received if DEBUG_MODE is enabled
    if (DEBUG_MODE && !firstMessageReceived) {
      firstMessageReceived = true;
      const botOnlineTask = {
        type: 'telegram',
        channelId: msg.chat.id,
        responseText: 'Bot online',
        createdAt: new Date()
      };
      try {
        await axios.post(`${DB_SERVICE_URL}/task`, botOnlineTask);
        console.log('Debug task created: Bot online message scheduled.');
      } catch (error) {
        console.error('Error creating debug task:', error);
      }
    }
  });

  // Periodically poll the "tasks" collection for tasks to handle
  const pollTasks = async () => {
    const response = await axios.get(`${DB_SERVICE_URL}/task?type=telegram`);
    if (response.status === 204) {
      // Schedule next poll
      setTimeout(pollTasks, 10000);
      return;
    }
    const task = response.data;

    try {

      // Post the task response in the specified channel
      await global.telegramBot.sendMessage(task.channelId, task.responseText);
      await axios.put(`${DB_SERVICE_URL}/task`, { taskId: task._id, status: 'handled' });
      // Schedule next poll
      setTimeout(pollTasks, 10000);

    } catch (error) {
      console.error('Error polling tasks:', error.message);
      await axios.put(`${DB_SERVICE_URL}/task`, { taskId: task._id, status: 'failed' });
      // Schedule next poll even if there was an error
      setTimeout(pollTasks, 30000);
    }
  };

  // Initialize the first poll
  pollTasks();

  // Graceful shutdown
  process.once('SIGINT', () => global.telegramBot.stopPolling());
  process.once('SIGTERM', () => global.telegramBot.stopPolling());
}

const bot = global.telegramBot;

process.on('unhandledRejection', (error) => {
  if (error.name === 'TimeoutError') {
    console.error('Operation timed out:', error);
    // Additional handling if necessary
  } else {
    console.error('Unhandled Rejection:', error);
  }
});
