import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured. Please add it to your environment variables.' },
        { status: 500 }
      );
    }

    const fetchResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert at extracting locations in Odesa, Ukraine from text. 
You will receive a JSON array of messages.
For each message, determine if it contains a street address, intersection, or specific location in Odesa.
Return a JSON object with a 'results' array. Each item in 'results' must have:
- 'id': the exact id of the message provided
- 'address': ONLY the clean, exact street address or intersection suitable for a geocoding API (e.g., "вулиця Дерибасівська, 1", "перехрестя Преображенської та Успенської"). DO NOT include extra context words like "ТЦК", "Блок пост", "полиция", "оливки", "облава", "шмон" etc. (or null if no exact address is found)
- 'possible_address': If there is no exact house number or intersection, but a street name, district, village, or landmark is mentioned (e.g., "Черноморского казачества б/п" -> "Черноморского казачества", "Свердлово радар на кормушке!!!!" -> "Свердлово"), put that clean location name here. (or null if nothing is found).
Do not invent coordinates. Output ONLY valid JSON.`,
          },
          {
            role: 'user',
            content: JSON.stringify(messages),
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!fetchResponse.ok) {
      const errorText = await fetchResponse.text();
      console.error('OpenAI API Error:', errorText);
      return NextResponse.json({ error: 'Ошибка API OpenAI: ' + errorText }, { status: 500 });
    }

    const responseData = await fetchResponse.json();

    let parsed: { results: any[] } = { results: [] };

    function findResults(obj: any): any {
      if (!obj || typeof obj !== 'object') return null;
      if (Array.isArray(obj.results)) return obj;

      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          try {
            const p = JSON.parse(obj[key]);
            if (p && Array.isArray(p.results)) return p;
          } catch (_) {}

          const match = obj[key].match(/\{[\s\S]*"results"[\s\S]*\}/);
          if (match) {
            try {
              const p = JSON.parse(match[0]);
              if (p && Array.isArray(p.results)) return p;
            } catch (_) {}
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

    return NextResponse.json({ results: parsed.results || [] });
  } catch (error: any) {
    console.error('Error extracting locations with OpenAI:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
