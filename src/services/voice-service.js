import { supabase } from './supabase.js';
import { openaiService } from './openai-service.js';

let mediaRecorder = null;
let audioChunks = [];
let speechRecognitionInstance = null;

export const voiceService = {
  /**
   * Request microphone permission from shopkeeper's browser
   */
  async requestPermission() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Microphone access is not supported on this browser/device.');
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return stream;
  },

  /**
   * Start audio recording using MediaRecorder
   */
  async startRecording(stream) {
    audioChunks = [];

    // Determine supported MIME type
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : 'audio/mp4';

    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.start(100); // 100ms chunks
    return { mimeType };
  },

  /**
   * Stop audio recording and return audio Blob and Base64 string
   */
  stopRecording(stream) {
    return new Promise((resolve, reject) => {
      if (!mediaRecorder) {
        reject(new Error('MediaRecorder was not initialized.'));
        return;
      }

      mediaRecorder.onstop = async () => {
        try {
          const mimeType = mediaRecorder.mimeType || 'audio/webm';
          const audioBlob = new Blob(audioChunks, { type: mimeType });

          // Convert blob to Base64
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
            const base64Data = reader.result.split(',')[1];
            // Stop mic tracks to release hardware
            if (stream) {
              stream.getTracks().forEach(track => track.stop());
            }
            resolve({ audioBlob, base64Data, mimeType });
          };
          reader.onerror = (err) => reject(err);
        } catch (err) {
          reject(err);
        }
      };

      mediaRecorder.stop();
    });
  },

  /**
   * Send audio to Supabase Edge Function `process-voice` (Gnani Prisma STT + OpenAI NLU)
   */
  async processAudio(base64Data, mimeType, language = 'kn-IN') {
    try {
      const { data, error } = await supabase.functions.invoke('process-voice', {
        body: {
          audioData: base64Data,
          mimeType: mimeType,
          language: language
        }
      });

      if (!error && data && data.understanding) {
        return {
          provider: 'gnani-prisma-openai',
          transcript: data.transcript,
          understanding: data.understanding
        };
      }
    } catch (edgeErr) {
      console.warn('Process-voice Edge Function unavailable or unconfigured:', edgeErr);
    }

    return null;
  },

  /**
   * Client-side Web Speech Recognition fallback for testing before Gnani Prisma keys are added to Supabase Secrets.
   * Clearly marked as browser fallback.
   */
  startSpeechRecognitionFallback(language = 'kn-IN', onResult, onError) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onError(new Error('SpeechRecognition is not supported in this browser. Please use Chrome/Edge or configure Gnani Prisma.'));
      return;
    }

    speechRecognitionInstance = new SpeechRecognition();
    speechRecognitionInstance.lang = language || 'kn-IN';
    speechRecognitionInstance.interimResults = false;
    speechRecognitionInstance.maxAlternatives = 1;

    speechRecognitionInstance.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const understanding = openaiService.parseLocally(transcript, language);
      onResult({
        provider: 'browser-stt-fallback',
        transcript,
        understanding
      });
    };

    speechRecognitionInstance.onerror = (err) => {
      onError(err);
    };

    speechRecognitionInstance.start();
  },

  stopSpeechRecognitionFallback() {
    if (speechRecognitionInstance) {
      try {
        speechRecognitionInstance.stop();
      } catch (e) {
        // ignore already stopped
      }
      speechRecognitionInstance = null;
    }
  }
};

