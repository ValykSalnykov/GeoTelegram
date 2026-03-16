import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const channel = searchParams.get('channel');
  if (!channel) {
    return NextResponse.json({ error: 'Channel is required' }, { status: 400 });
  }

  try {
    const cleanChannel = channel.replace('@', '').trim();
    const lastId = parseInt(searchParams.get('last_id') || '0');

    let allMessages: { id: number; text: string; timestamp: string }[] = [];

    const timeLimit = new Date();
    timeLimit.setHours(0, 0, 0, 0); // Start of today

    let currentUrl = `https://t.me/s/${cleanChannel}`;
    let keepFetching = true;
    let fetchCount = 0;
    const maxFetches = lastId === 0 ? 20 : 1;

    while (keepFetching && fetchCount < maxFetches) {
      fetchCount++;
      const response = await fetch(currentUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });

      if (!response.ok) {
        if (response.status === 404 && fetchCount === 1) {
          return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
        }
        break;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      let pageMessages: { id: number; text: string; timestamp: string }[] = [];
      let oldestTimestampOnPage = new Date();

      $('.tgme_widget_message').each((_i, el) => {
        const msgIdStr = $(el).attr('data-post');
        if (!msgIdStr) return;
        const msgId = parseInt(msgIdStr.split('/')[1]);

        const textEl = $(el).find('.tgme_widget_message_text');
        textEl.find('br').replaceWith(' ');
        let text = textEl.text().trim();

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
        keepFetching = false;
      }
    }

    // Deduplicate by ID and sort ascending
    const uniqueMessagesMap = new Map();
    allMessages.forEach((m) => uniqueMessagesMap.set(m.id, m));
    const uniqueMessages = Array.from(uniqueMessagesMap.values());
    uniqueMessages.sort((a, b) => a.id - b.id);

    let messagesToReturn = [];

    if (lastId === 0) {
      messagesToReturn = uniqueMessages.filter((m) => new Date(m.timestamp) >= timeLimit);
      if (messagesToReturn.length === 0) {
        messagesToReturn = uniqueMessages.slice(-10);
      }
    } else {
      messagesToReturn = uniqueMessages.filter((m) => m.id > lastId);
    }

    const newLastId =
      uniqueMessages.length > 0 ? uniqueMessages[uniqueMessages.length - 1].id : lastId;

    return NextResponse.json({ messages: messagesToReturn, lastId: newLastId });
  } catch (error: any) {
    console.error('Error polling channel:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
