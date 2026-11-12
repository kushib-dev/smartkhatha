import { supabase } from './supabase.js';

let currentAudio = null;

export const ttsService = {
  /**
   * Speak a given message in the shopkeeper's preferred language
   * Uses Gnani Timbre v3.0 via Supabase Edge Function with browser Web Speech Synthesis fallback.
   */
  async speak(text, language = 'kn-IN') {
    if (!text || typeof text !== 'string') return;

    // Stop any ongoing playback
    this.stop();

    try {
      // 1. Attempt Supabase Edge Function for Gnani Timbre v3.0
      const { data, error } = await supabase.functions.invoke('text-to-speech', {
        body: { text, language }
      });

      if (!error && data) {
        // If Edge function returned an audio blob
        if (data instanceof Blob) {
          const audioUrl = URL.createObjectURL(data);
          currentAudio = new Audio(audioUrl);
          await currentAudio.play();
          return { provider: 'gnani-timbre', status: 'success' };
        }
      }
    } catch (edgeErr) {
      console.warn('Gnani Timbre Edge Function unavailable, using Web Speech API fallback:', edgeErr);
    }

    // 2. Client-side Web Speech Synthesis fallback
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        console.warn('Browser does not support SpeechSynthesis.');
        resolve({ provider: 'none', status: 'unsupported' });
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language || 'kn-IN';
      utterance.rate = 0.95; // Slightly slower for clarity
      utterance.pitch = 1.0;

      // Select voice matching language if available
      const voices = window.speechSynthesis.getVoices();
      const matchingVoice = voices.find(v => v.lang.startsWith(language.split('-')[0]));
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }

      utterance.onend = () => {
        resolve({ provider: 'browser-speech-fallback', status: 'success' });
      };

      utterance.onerror = (e) => {
        console.error('Speech synthesis error:', e);
        resolve({ provider: 'browser-speech-fallback', status: 'error' });
      };

      window.speechSynthesis.speak(utterance);
    });
  },

  /**
   * Stop any actively playing speech
   */
  stop() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }
};

