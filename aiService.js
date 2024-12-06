import 'dotenv/config';
import axios from 'axios';
import { OpenAI } from 'openai';
import fs from 'fs';

const DB_SERVICE_URL = 'http://127.0.0.1:3009';
const POLL_INTERVAL = 5000; // 5 seconds
const SYSTEM_PROMPT = fs.readFileSync('./system_prompt.txt', 'utf-8');
const BOT_HANDLE = process.env.BOT_HANDLE || 'AI Bot';

// Initialize OpenAI
const openai = new OpenAI({
    baseURL: process.env.OPENAI_API_URI || "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY,
    defaultHeaders: process.env.OPENROUTER_API_KEY ? {
        "HTTP-Referer": process.env.YOUR_SITE_URL,
        "X-Title": process.env.YOUR_APP_NAME,
    } : {}
});

// Initialize lastCheckTimes as a map for each channel
const lastCheckTimes = {};

async function getConversationContext(channelId) {
    try {
        const response = await axios.get(`${DB_SERVICE_URL}/messages`, {
            params: { channel: channelId, limit: 5 }
        });
        return response.data.map(msg => {
            // Check if the message is from the bot or if the author is blank
            const role = (!msg.author || msg.author === BOT_HANDLE) ? 'assistant' : 'user';
            const content = role === 'assistant'
                ? msg.text
                : `${msg.author}: ${msg.text}`;
            return { role, content };
        });
    } catch (error) {
        console.error('Error fetching conversation context:', error);
        return [];
    }
}

async function generateAIResponse(channelId, newMessages) {
    try {
        // Fetch the full conversation history
        const contextMessages = await getConversationContext(channelId);
        const messages = [
            ...contextMessages
        ];

        // Add new messages from users to the history
        let lastImageUrl = null;

        // Find the last message with an image URL
        newMessages.forEach(msg => {
            if (msg.imageUrl) {
                lastImageUrl = msg;
            }
        });

        // Process all messages, but only add the last image
        newMessages.forEach(msg => {
            const role = (!msg.author || msg.author === BOT_HANDLE) ? 'assistant' : 'user';

            if (msg.text !== '') {
                messages.push({
                    role,
                    content: (role === 'assistant'
                        ? msg.text
                        : `${msg.author}: ${msg.text}`)
                });
            }

            // Add the last image with the review instruction if applicable
            if (msg === lastImageUrl && msg.imageUrl) {
                messages.push({
                    role,
                    content: [
                        { type: 'text', text: 'Briefly describe and critique this artwork as Eliza Whiskers, relying on your incisive wit and trademark sarcasm.' },
                        { type: 'image_url', image_url: { url: msg.imageUrl } }
                    ]
                });
            }
        });


        const response = await openai.chat.completions.create({
            model: process.env.VISION_MODEL || "meta-llama/llama-3.2-11b-vision-instruct",
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...messages.slice(-8)
            ],
            temperature: 0.8,
        });

        return response.choices[0].message.content;
    } catch (error) {
        console.error('Error generating AI response:', error);
        return 'Sorry, I couldn’t generate a response at the moment.';
    }
}

let lastMessageTime = 0;
// Modify processNewMessages function
async function processNewMessages() {
    try {
        // Fetch the last message for each channel
        const response = await axios.get(`${DB_SERVICE_URL}/messages`);
        const messages = response.data;

        // Update lastCheckTimes and process each channel
        for (const msg of messages) {
            const channelId = msg.channel;
            const messageTime = new Date(msg.time * 1000);
            if (messageTime <= lastMessageTime) {
                continue;
            }
            lastMessageTime = messageTime;

            // If the message is from the bot, skip it
            if (msg.author === BOT_HANDLE) {
                continue;
            }

            // Check if there are new messages since the last check
            if (!lastCheckTimes[channelId] || messageTime > lastCheckTimes[channelId]) {
                // Fetch additional messages for the channel
                const newMessagesResponse = await axios.get(`${DB_SERVICE_URL}/messages`, {
                    params: {
                        channel: channelId,
                        limit: 8
                    }
                });
                const newMessages = newMessagesResponse.data;

                if (newMessages.length > 0 && newMessages[newMessages.length - 1].author !== BOT_HANDLE) {
                    // Generate AI response for new messages
                    const aiResponse = await generateAIResponse(channelId, newMessages);

                    // Create a task to send the response
                    const task = {
                        type: 'telegram',
                        channelId,
                        responseText: aiResponse,
                        createdAt: new Date(),
                        context: await getConversationContext(channelId)
                    };

                    await axios.post(`${DB_SERVICE_URL}/task`, task);
                    console.log(`Created task for channel ${channelId}`);

                    // Add AI's response to the database
                    const aiMessage = {
                        author: BOT_HANDLE,
                        channel: `${channelId}`,
                        text: aiResponse,
                        time: Math.floor(Date.now() / 1000),
                        to: msg.to || 'private',
                    };
                    await axios.post(`${DB_SERVICE_URL}/message`, aiMessage);

                    // Update the lastCheckTime for the channel
                    lastCheckTimes[channelId] = new Date();
                }
            }
        }
    } catch (error) {
        console.error('Error processing messages:', error);
    }
}

async function pollMessages() {
    await processNewMessages();
    setTimeout(pollMessages, POLL_INTERVAL);
}

// Start polling for new messages
pollMessages();

console.log('AI Service started');

// Handle graceful shutdown
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
