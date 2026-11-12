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
    const { text, language = "kn-IN" } = await req.json();

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Missing text payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const gnaniApiKey = Deno.env.get("GNANI_TIMBRE_API_KEY");
    const gnaniToken = Deno.env.get("GNANI_TIMBRE_ACCESS_TOKEN");

    // Call Gnani Timbre v3.0 (Text-to-Speech)
    if (gnaniApiKey || gnaniToken) {
      const timbreEndpoint = Deno.env.get("GNANI_TIMBRE_ENDPOINT") || "https://api.gnani.ai/v3/tts";
      const ttsResponse = await fetch(timbreEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": gnaniApiKey || "",
          "Authorization": `Bearer ${gnaniToken || ""}`
        },
        body: JSON.stringify({
          text: text,
          language: language,
          audio_format: "wav"
        })
      });

      if (!ttsResponse.ok) {
        throw new Error(`Gnani Timbre TTS failed: ${ttsResponse.statusText}`);
      }

      const audioBuffer = await ttsResponse.arrayBuffer();
      return new Response(audioBuffer, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "audio/wav"
        }
      });
    } else {
      // Documented integration placeholder
      return new Response(
        JSON.stringify({
          error: "GNANI_TIMBRE_API_KEY or GNANI_TIMBRE_ACCESS_TOKEN not configured in Supabase Edge Secrets.",
          isConfigured: false
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "TTS generation error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

