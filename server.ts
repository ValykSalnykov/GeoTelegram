import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { Server } from 'socket.io';
import http from 'http';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  const PORT = 3000;

  app.use(express.json());

  // In-memory store for locations
  const locations: any[] = [];
  
  // Store last processed message ID per channel
  const channelStates: Record<string, number> = {};

  // API routes FIRST
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/locations', (req, res) => {
    res.json(locations);
  });

  app.post('/api/locations', (req, res) => {
    const location = req.body;
    locations.push(location);
    io.emit('new_location', location);
    res.json({ success: true });
  });

  app.use(express.json());

  app.post('/api/extract_locations', async (req, res) => {
    try {
      const { messages } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Messages array is required' });
      }

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'OPENAI_API_KEY is not configured. Please add it in the Settings menu.' });
      }

      const fetchResponse = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-5-mini",
          input: [
            {
              role: "system",
              content: `You are an expert at extracting locations in Odesa, Ukraine from text. 
You will receive a JSON array of messages.
For each message, determine if it contains a street address, intersection, or specific location in Odesa.
Return a JSON object with a 'results' array. Each item in 'results' must have:
- 'id': the exact id of the message provided
- 'address': ONLY the clean, exact street address or intersection suitable for a geocoding API (e.g., "вулиця Дерибасівська, 1", "перехрестя Преображенської та Успенської"). DO NOT include extra context words like "ТЦК", "Блок пост", "полиция", "оливки", "облава", "шмон" etc. (or null if no exact address is found)
- 'possible_address': If there is no exact house number or intersection, but a street name, district, village, or landmark is mentioned (e.g., "Черноморского казачества б/п" -> "Черноморского казачества", "Свердлово радар на кормушке!!!!" -> "Свердлово"), put that clean location name here. (or null if nothing is found).
Do not invent coordinates. Output ONLY valid JSON.`
            },
            {
              role: "user",
              content: JSON.stringify(messages)
            }
          ],
          text: {
            format: {
              type: "json_object"
            },
            verbosity: "medium"
          },
          reasoning: {
            effort: "medium",
            summary: "auto"
          },
          tools: [],
          store: true,
          include: [
            "reasoning.encrypted_content",
            "web_search_call.action.sources"
          ]
        })
      });

      if (!fetchResponse.ok) {
        const errorText = await fetchResponse.text();
        console.error("OpenAI API Error:", errorText);
        return res.status(500).json({ error: 'Ошибка API OpenAI: ' + errorText });
      }

      const responseData = await fetchResponse.json();
      
      let parsed = { results: [] };
      
      // Extremely robust recursive search for the results array
      function findResults(obj: any): any {
        if (!obj || typeof obj !== 'object') return null;
        if (Array.isArray(obj.results)) return obj;
        
        for (const key in obj) {
          if (typeof obj[key] === 'string') {
            try {
              const p = JSON.parse(obj[key]);
              if (p && Array.isArray(p.results)) return p;
            } catch(e) {}
            
            // Try to extract JSON from markdown blocks or raw text
            const match = obj[key].match(/\{[\s\S]*"results"[\s\S]*\}/);
            if (match) {
              try {
                const p = JSON.parse(match[0]);
                if (p && Array.isArray(p.results)) return p;
              } catch(e) {}
            }
          } else if (typeof obj[key] === 'object') {
            const res = findResults(obj[key]);
            if (res) return res;
          }
        }
        return null;
      }

      const found = findResults(responseData);
      if (found) {
        parsed = found;
      } else {
        console.error('Could not find results array in OpenAI response:', responseData);
      }
      
      res.json({ results: parsed.results || [] });
    } catch (error: any) {
      console.error('Error extracting locations with OpenAI:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/poll_channel', async (req, res) => {
    const channel = req.query.channel as string;
    if (!channel) return res.status(400).json({ error: 'Channel is required' });

    try {
      const cleanChannel = channel.replace('@', '').trim();
      const lastId = parseInt(req.query.last_id as string) || 0;
      
      let allMessages: {id: number, text: string, timestamp: string}[] = [];
      
      const timeLimit = new Date();
      timeLimit.setHours(0, 0, 0, 0); // Start of today

      let currentUrl = `https://t.me/s/${cleanChannel}`;
      let keepFetching = true;
      let fetchCount = 0;
      const maxFetches = lastId === 0 ? 20 : 1; // Fetch up to 20 pages on initial load

      while (keepFetching && fetchCount < maxFetches) {
        fetchCount++;
        const response = await fetch(currentUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        
        if (!response.ok) {
          if (response.status === 404 && fetchCount === 1) return res.status(404).json({ error: 'Channel not found' });
          break;
        }
        
        const html = await response.text();
        const $ = cheerio.load(html);
        
        let pageMessages: {id: number, text: string, timestamp: string}[] = [];
        let oldestTimestampOnPage = new Date();

        $('.tgme_widget_message').each((i, el) => {
          const msgIdStr = $(el).attr('data-post');
          if (!msgIdStr) return;
          const msgId = parseInt(msgIdStr.split('/')[1]);
          
          const textEl = $(el).find('.tgme_widget_message_text');
          textEl.find('br').replaceWith(' ');
          let text = textEl.text().trim();
          
          // Remove the specific spam text
          text = text.replace(/пиши о погоде.*?Подписывайся\.?/gi, '').trim();
          
          const timeEl = $(el).find('time.time');
          const timestamp = timeEl.attr('datetime') || new Date().toISOString();

          if (msgId && text) {
            pageMessages.push({ id: msgId, text, timestamp });
            const msgDate = new Date(timestamp);
            if (msgDate < oldestTimestampOnPage) {
              oldestTimestampOnPage = msgDate;
            }
          }
        });

        allMessages = [...allMessages, ...pageMessages];

        if (lastId === 0) {
          // If we're fetching the last 6 hours, check if we need to go further back
          if (oldestTimestampOnPage < timeLimit || pageMessages.length === 0) {
            keepFetching = false;
          } else {
            const moreLink = $('.tme_messages_more').attr('href');
            if (moreLink) {
              currentUrl = `https://t.me${moreLink}`;
            } else {
              keepFetching = false;
            }
          }
        } else {
          keepFetching = false; // Only 1 page if polling for new messages
        }
      }

      // Deduplicate by ID and sort ascending
      const uniqueMessagesMap = new Map();
      allMessages.forEach(m => uniqueMessagesMap.set(m.id, m));
      const uniqueMessages = Array.from(uniqueMessagesMap.values());
      uniqueMessages.sort((a, b) => a.id - b.id);
      
      let messagesToReturn = [];
      
      if (lastId === 0) {
        // First time polling this channel, return messages from the last 6 hours
        messagesToReturn = uniqueMessages.filter(m => new Date(m.timestamp) >= timeLimit);
        
        // Fallback if no messages in last 6 hours: return last 10
        if (messagesToReturn.length === 0) {
          messagesToReturn = uniqueMessages.slice(-10);
        }
      } else {
        messagesToReturn = uniqueMessages.filter(m => m.id > lastId);
      }
      
      const newLastId = uniqueMessages.length > 0 ? uniqueMessages[uniqueMessages.length - 1].id : lastId;
      
      res.json({ messages: messagesToReturn, lastId: newLastId });
    } catch (error: any) {
      console.error('Error polling channel:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
