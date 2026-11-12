import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { audioData, mimeType, language = "kn-IN" } = await req.json();

    if (!audioData) {
      return new Response(
        JSON.stringify({ error: "Missing audioData payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const gnaniApiKey = Deno.env.get("GNANI_PRISMA_API_KEY");
    const gnaniToken = Deno.env.get("GNANI_PRISMA_ACCESS_TOKEN");
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    let transcript = "";

    // 1. Process Speech-to-Text via Gnani Prisma v3.0
    if (gnaniApiKey || gnaniToken) {
      const prismaEndpoint = Deno.env.get("GNANI_PRISMA_ENDPOINT") || "https://api.gnani.ai/v3/asr";
      const sttResponse = await fetch(prismaEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": gnaniApiKey || "",
          "Authorization": `Bearer ${gnaniToken || ""}`
        },
        body: JSON.stringify({
          audio: audioData,
          format: mimeType || "audio/wav",
          language: language
        })
      });

      if (!sttResponse.ok) {
        throw new Error(`Gnani Prisma STT failed: ${sttResponse.statusText}`);
      }

      const sttResult = await sttResponse.json();
      transcript = sttResult.transcript || sttResult.text || "";
    } else {
      // Documented integration placeholder when credentials are not yet supplied
      return new Response(
        JSON.stringify({
          error: "GNANI_PRISMA_API_KEY or GNANI_PRISMA_ACCESS_TOKEN not configured in Supabase Edge Secrets.",
          isConfigured: false
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Process Transcript with OpenAI for Intent & Entity Extraction
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({
          transcript,
          error: "OPENAI_API_KEY not configured in Supabase Edge Secrets.",
          isConfigured: false
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `
You are the Natural Language Understanding engine for SmartKhata AI, a voice digital ledger for Indian Kirana store keepers.
The shopkeeper speaks in Kannada (often in Kannada script or Romanized Kannada like "Ramesh ge 500 rupayi udhara kodi"), English, or Hindi ("Ramesh ka total balance kitna hai", "Ramesh ne 200 rupaye diye").

Identify one of four intents:
1. ADD_CREDIT (Shopkeeper gave credit/goods to customer. e.g. "Ramesh ge 500 rupayi udhara", "Give 200 credit to Suresh")
2. RECORD_PAYMENT (Customer paid money/cleared debt. e.g. "Ramesh 200 rupayi kottidane", "Ramesh paid 500", "Jama 300 Suresh")
3. CHECK_BALANCE (Shopkeeper wants to know current balance. e.g. "Ramesh balance kitna hai", "Ramesh ge balance eshtu")
4. UNKNOWN (Ambiguous, unclear, missing crucial amount or customer name)

STRICT RULES:
- Never guess or invent transaction amounts or customer names.
- If amount is missing for ADD_CREDIT or RECORD_PAYMENT, mark intent as UNKNOWN and ask for clarification.
- Return ONLY valid JSON matching the schema.
`;

    const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Transcribed audio: "${transcript}"` }
        ]
      })
    });

    if (!openAiResponse.ok) {
      throw new Error(`OpenAI NLU failed: ${openAiResponse.statusText}`);
    }

    const openAiResult = await openAiResponse.json();
    const parsedData = JSON.parse(openAiResult.choices[0].message.content);

    return new Response(
      JSON.stringify({
        transcript,
        understanding: parsedData
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal voice processing error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

