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
   * Process voice audio or transcript through local API, Supabase Edge Function, or local NLU
   */
  async processAudio(base64Data, mimeType, language = 'kn-IN', transcriptHint = '') {
    // 1. If transcript exists, try local Vite dev server API with OpenAI
    if (transcriptHint) {
      try {
        const localRes = await fetch('/api/process-voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: transcriptHint, language })
        });
        if (localRes.ok) {
          const localData = await localRes.json();
          if (localData && localData.understanding) {
            return localData;
          }
        }
      } catch (localErr) {
        console.warn('Local process-voice API call warning:', localErr);
      }
    }

    // 2. Attempt Supabase Edge Function `process-voice`
    if (base64Data) {
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
        console.warn('Supabase edge function process-voice unavailable:', edgeErr);
      }
    }

    // 3. Robust client-side fallback if transcript was captured
    if (transcriptHint) {
      const understanding = openaiService.parseLocally(transcriptHint, language);
      return {
        provider: 'browser-speech-local-nlu',
        transcript: transcriptHint,
        understanding
      };
    }

    return null;
  },

  /**
   * Start real-time speech recognition
   */
  startSpeechRecognitionFallback(language = 'kn-IN', onResult, onError, onInterim) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (onError) onError(new Error('SpeechRecognition is not supported in this browser. Please use Chrome or Edge.'));
      return null;
    }

    try {
      if (speechRecognitionInstance) {
        this.stopSpeechRecognitionFallback();
      }

      speechRecognitionInstance = new SpeechRecognition();
      speechRecognitionInstance.lang = language || 'kn-IN';
      speechRecognitionInstance.continuous = true;
      speechRecognitionInstance.interimResults = true;
      speechRecognitionInstance.maxAlternatives = 1;

      let finalTranscript = '';

      speechRecognitionInstance.onresult = (event) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const combined = (finalTranscript + interimTranscript).trim();
        if (onInterim && combined) {
          onInterim(combined);
        }

        if (event.results[event.results.length - 1].isFinal && onResult) {
          const understanding = openaiService.parseLocally(combined, language);
          onResult({
            provider: 'browser-stt',
            transcript: combined,
            understanding
          });
        }
      };

      speechRecognitionInstance.onerror = (err) => {
        console.warn('SpeechRecognition event warning:', err.error);
        if (onError && err.error !== 'no-speech') {
          onError(err);
        }
      };

      speechRecognitionInstance.start();
      return speechRecognitionInstance;
    } catch (e) {
      console.warn('Could not start speech recognition:', e);
      return null;
    }
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

