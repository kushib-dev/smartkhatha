import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    server: {
      port: 3000,
      open: false,
      watch: {
        ignored: ['**/*.zip', '**/.zip']
      }
    },
    plugins: [
      {
        name: 'voice-api-proxy',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url === '/api/process-voice' && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk) => { body += chunk; });
              req.on('end', async () => {
                try {
                  const payload = JSON.parse(body || '{}');
                  const { transcript, language = 'kn-IN' } = payload;
                  const openAiKey = env.OPENAI_API_KEY;

                  if (transcript && openAiKey) {
                    try {
                      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${openAiKey}`
                        },
                        body: JSON.stringify({
                          model: 'gpt-4o-mini',
                          response_format: { type: 'json_object' },
                          messages: [
                            {
                              role: 'system',
                              content: `You are the Natural Language Understanding engine for SmartKhata AI, a voice digital ledger for Indian Kirana store keepers.
Language: ${language}.
The shopkeeper speaks in Kannada, English, or Hindi.
Extract JSON matching:
{
  "intent": "ADD_CREDIT" | "RECORD_PAYMENT" | "CHECK_BALANCE" | "UNKNOWN",
  "customer_name": string | null,
  "transaction_type": "credit" | "payment" | null,
  "amount": number | null,
  "notes": string | null,
  "clarification_needed": boolean,
  "reply_message": string
}`
                            },
                            { role: 'user', content: `Transcribed audio: "${transcript}"` }
                          ]
                        })
                      });

                      if (aiRes.ok) {
                        const aiData = await aiRes.json();
                        const understanding = JSON.parse(aiData.choices[0].message.content);
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({
                          provider: 'openai-gpt4o-mini',
                          transcript,
                          understanding
                        }));
                        return;
                      } else {
                        const errText = await aiRes.text();
                        console.warn('OpenAI API status:', aiRes.status, errText);
                      }
                    } catch (e) {
                      console.warn('OpenAI request error:', e.message);
                    }
                  }

                  // If OpenAI is unavailable or has no quota, indicate fallback needed
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
                    provider: 'local-fallback-required',
                    transcript: transcript || '',
                    understanding: null
                  }));
                } catch (err) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
              return;
            }
            next();
          });
        }
      }
    ],
    build: {
      target: 'esnext'
    }
  };
});
