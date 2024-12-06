import 'dotenv/config';
import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';

const app = express();
const port = process.env.DB_PORT || 3000;

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error('Please provide MONGO_URI in your .env file');
  process.exit(1);
}

const mongoClient = new MongoClient(mongoUri);

mongoClient.connect().then(() => {
  console.log('Connected to MongoDB');
}).catch(error => {
  console.error('MongoDB connection error:', error);
});

app.use(express.json());
// support query params
app.use(express.urlencoded({ extended: true }));

// Endpoint to log messages
app.post('/message', async (req, res) => {
  const logEntry = req.body;
  try {
    await mongoClient.db('ratimint').collection('telegram').insertOne({
      author: logEntry.author || logEntry.msg?.from?.id || 'Unknown',
      time: logEntry.time ? logEntry.time : Date.now(),
      channel: `${logEntry.channel}`,
      to: `${logEntry.to}` || 'private',
      text: `${logEntry.text}` || '',
      imageUrl: logEntry.imageUrl || null
    });
    res.status(200).send('Message logged');
  } catch (error) {
    console.error('Error logging message:', error);
    res.status(500).send('Error logging message');
  }
});

// Endpoint to create a task
app.post('/task', async (req, res) => {
  const task = req.body;
  if (!task.type || !task.channelId || !task.responseText) {
    return res.status(400).send('Task type, channel ID, and response text are required');
  }
  task.status = 'pending';
  try {
    await mongoClient.db('ratimint').collection('tasks').insertOne(task);
    res.status(200).send('Task created');
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).send('Error creating task');
  }
});

// Endpoint to fetch the next pending task and mark it as running
app.get('/task', async (req, res) => {
  const type = `${req.query.type || ''}`.trim();
  try {
    const result = await mongoClient.db('ratimint').collection('tasks').findOneAndUpdate(
      { type, status: 'pending' },
      { $set: { status: 'running' } },
      { returnOriginal: false }
    );
    if (result) {
      res.status(200).json(result);
    } else {
      res.status(204).send();
    }
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).send('Error fetching tasks');
  }
});

// Endpoint to update a task
app.put('/task', async (req, res) => {
  const { taskId, status } = req.body;
  if (!taskId || !status) {
    return res.status(400).send('Task ID and status are required');
  }
  const validStatuses = ['handled', 'running', 'failed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).send('Invalid status');
  }
  try {
    await mongoClient.db('ratimint').collection('tasks').updateOne(
      { _id: new ObjectId(taskId) }, // Corrected ObjectId creation
      { $set: { status } }
    );
    res.status(200).send('Task handled');
  } catch (error) {
    console.error('Error handling task:', error);
    res.status(500).send('Error handling task');
  }
});

// Endpoint to fetch recent messages
app.get('/messages', async (req, res) => {
  const { channel, limit, skip = 0 } = req.query;
  try {
    let query = {};
    if (channel) {
      query.channel = `${channel}`;
    }

    let messages;
    if (channel) {
      messages = (await mongoClient.db('ratimint')
        .collection('telegram')
        .find(query)
        .sort({ time: -1 })
        .limit(parseInt(limit || 8))
        .skip(parseInt(skip))
        .toArray())
        .reverse();
    } else {
      // Return the most recent message per channel
      const aggregation = [
        { $sort: { channel: 1, time: -1 } },
        {
          $group: {
            _id: "$channel",
            latestMessage: { $first: "$$ROOT" }
          }
        },
        { $replaceRoot: { newRoot: "$latestMessage" } }
      ];
      messages = await mongoClient.db('ratimint')
        .collection('telegram')
        .aggregate(aggregation)
        .toArray();
    }

    res.status(200).json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).send('Error fetching messages');
  }
});

app.listen(port, () => {
  console.log(`DB Service running on http://localhost:${port}`);
});