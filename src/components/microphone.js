import { voiceService } from '../services/voice-service.js';
import { ttsService } from '../services/tts-service.js';
import { openConfirmationModal } from './confirmation-modal.js';
import { supabase } from '../services/supabase.js';
import { formatINR } from '../utils/currency.js';
import { showToast } from '../utils/toast.js';

// Assistant Operational States
export const VOICE_STATES = {
  IDLE: 'idle',
  LISTENING: 'listening',
  PROCESSING: 'processing',       // STT via Gnani Prisma
  UNDERSTANDING: 'understanding', // NLU via OpenAI
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  SAVING: 'saving',
  SUCCESS: 'success',
  ERROR: 'error'
};

let activeStream = null;
let currentState = VOICE_STATES.IDLE;
let assistantModal = null;
let currentLiveTranscript = '';

export const voiceAssistant = {
  /**
   * Launch the voice assistant session
   */
  async start({ shopId, preferredLanguage = 'kn-IN', onSuccess }) {
    if (currentState !== VOICE_STATES.IDLE) {
      this.cancel();
    }

    currentLiveTranscript = '';
    this.renderModal(preferredLanguage);
    this.setState(VOICE_STATES.LISTENING, 'Listening to your command... Speak now');

    // Start live browser speech recognition if supported
    voiceService.startSpeechRecognitionFallback(
      preferredLanguage,
      (res) => {
        if (res?.transcript) currentLiveTranscript = res.transcript;
      },
      (err) => console.warn('Live STT notice:', err),
      (interim) => {
        currentLiveTranscript = interim;
        const transcriptBox = assistantModal?.querySelector('#voice-transcript-box');
        if (transcriptBox && interim) {
          transcriptBox.style.display = 'block';
          transcriptBox.innerHTML = `<em>"${interim}"</em>`;
        }
      }
    );

    try {
      // 1. Request microphone access for audio recording
      activeStream = await voiceService.requestPermission();

      // 2. Start recording
      const { mimeType } = await voiceService.startRecording(activeStream);

      // Setup Stop Recording Button
      const actionBtn = assistantModal.querySelector('#voice-assistant-action-btn');
      if (actionBtn) {
        actionBtn.onclick = async () => {
          await this.finishRecordingAndProcess({
            stream: activeStream,
            mimeType,
            shopId,
            preferredLanguage,
            onSuccess
          });
        };
      }

      // Auto-stop after 8 seconds of speech if user doesn't press stop
      this.autoStopTimer = setTimeout(async () => {
        if (currentState === VOICE_STATES.LISTENING) {
          await this.finishRecordingAndProcess({
            stream: activeStream,
            mimeType,
            shopId,
            preferredLanguage,
            onSuccess
          });
        }
      }, 8000);

    } catch (err) {
      console.warn('Microphone error or permission denied:', err);
      if (!window.webkitSpeechRecognition && !window.SpeechRecognition) {
        this.setState(VOICE_STATES.ERROR, err.message || 'Microphone access was denied. Please allow microphone permissions.');
      }
    }
  },

  /**
   * Finish audio recording and send to processing pipeline
   */
  async finishRecordingAndProcess({ stream, mimeType, shopId, preferredLanguage, onSuccess }) {
    clearTimeout(this.autoStopTimer);

    try {
      this.setState(VOICE_STATES.PROCESSING, 'Processing voice command...');
      voiceService.stopSpeechRecognitionFallback();

      let base64Data = null;
      if (stream) {
        try {
          const recResult = await voiceService.stopRecording(stream);
          base64Data = recResult.base64Data;
        } catch (e) {
          console.warn('Audio recording stop warning:', e);
        }
      }

      // Send to processing pipeline (Local API, Edge Function, or local NLU)
      const result = await voiceService.processAudio(base64Data, mimeType, preferredLanguage, currentLiveTranscript);

      if (result && result.understanding) {
        this.setState(VOICE_STATES.UNDERSTANDING, 'Understanding transaction details...');
        this.handleUnderstandingResult(result.understanding, result.transcript || currentLiveTranscript, shopId, preferredLanguage, onSuccess);
      } else {
        this.setState(
          VOICE_STATES.ERROR,
          'No speech was detected or understood. Please speak clearly and try again.'
        );
      }
    } catch (err) {
      console.error('Audio processing failed:', err);
      this.setState(VOICE_STATES.ERROR, err.message || 'Failed to process voice audio.');
    }
  },

  /**
   * Handle parsed intention and entity extraction
   */
  async handleUnderstandingResult(understanding, transcript, shopId, preferredLanguage, onSuccess) {
    const { intent, customer_name, transaction_type, amount, notes, clarification_needed, reply_message } = understanding;

    // Display transcript
    const transcriptBox = assistantModal.querySelector('#voice-transcript-box');
    if (transcriptBox && transcript) {
      transcriptBox.style.display = 'block';
      transcriptBox.innerHTML = `<em>"${transcript}"</em>`;
    }

    // 1. Ambiguous or missing essential info
    if (intent === 'UNKNOWN' || clarification_needed) {
      const msg = reply_message || 'Could not identify customer or amount. Please try speaking again.';
      this.setState(VOICE_STATES.ERROR, msg);
      ttsService.speak(msg, preferredLanguage);
      return;
    }

    // 2. CHECK_BALANCE Intent (Read-only query)
    if (intent === 'CHECK_BALANCE') {
      await this.handleCheckBalance(customer_name, shopId, preferredLanguage);
      return;
    }

    // 3. ADD_CREDIT or RECORD_PAYMENT Intent
    if (intent === 'ADD_CREDIT' || intent === 'RECORD_PAYMENT') {
      this.setState(VOICE_STATES.AWAITING_CONFIRMATION, 'Confirming details...');
      this.closeModal();

      // Open the Confirmation Modal
      openConfirmationModal({
        shopId,
        customerName: customer_name,
        transactionType: transaction_type || (intent === 'ADD_CREDIT' ? 'credit' : 'payment'),
        amount: amount,
        notes: notes || '',
        preferredLanguage,
        onSuccess: (data) => {
          if (onSuccess) onSuccess(data);
        },
        onCancel: () => {
          this.cancel();
        }
      });
    }
  },

  /**
   * Query database for customer balance and speak the result
   */
  async handleCheckBalance(customerName, shopId, preferredLanguage) {
    this.setState(VOICE_STATES.PROCESSING, `Checking ledger balance for ${customerName}...`);

    try {
      // Find customer
      const { data: customers, error } = await supabase
        .from('customers')
        .select('id, customer_name')
        .eq('shop_id', shopId)
        .ilike('customer_name', `%${customerName}%`)
        .eq('is_archived', false)
        .limit(1);

      if (error || !customers || customers.length === 0) {
        const notFoundMsg = `Customer "${customerName}" was not found in your shop.`;
        this.setState(VOICE_STATES.ERROR, notFoundMsg);
        ttsService.speak(notFoundMsg, preferredLanguage);
        return;
      }

      const customer = customers[0];

      // Retrieve balance using PostgreSQL database RPC
      const { data: balance, error: balErr } = await supabase.rpc('get_customer_balance', {
        p_customer_id: customer.id
      });

      if (balErr) throw balErr;

      const numBalance = Number(balance) || 0;
      const formatted = formatINR(numBalance);

      const statusEl = assistantModal.querySelector('#voice-assistant-status-text');
      if (statusEl) {
        statusEl.innerHTML = `
          <div style="background: #f0fdf4; border: 1.5px solid var(--payment-border); border-radius: var(--radius-md); padding: 1.25rem; margin-top: 1rem;">
            <div style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">CURRENT BALANCE</div>
            <h3 style="margin-top: 0.25rem; font-size: 1.25rem;">${customer.customer_name}</h3>
            <div style="font-size: 1.75rem; font-weight: 800; color: ${numBalance > 0 ? 'var(--credit-color)' : 'var(--payment-color)'}; margin-top: 0.5rem;">
              ${formatted}
            </div>
            <p style="font-size: 0.8rem; margin-top: 0.35rem; color: var(--text-secondary);">
              ${numBalance > 0 ? 'Outstanding credit owed to shop' : 'Zero balance / Paid up'}
            </p>
          </div>
        `;
      }

      // Spoken response in preferred language
      const spokenMsg = preferredLanguage.startsWith('kn')
        ? `${customer.customer_name} ಅವರ ಒಟ್ಟು ಬಾಕಿ ಮೊತ್ತ ${Math.abs(numBalance)} ರೂಪಾಯಿಗಳು.`
        : `${customer.customer_name}'s current balance is ${Math.abs(numBalance)} rupees.`;

      ttsService.speak(spokenMsg, preferredLanguage);

      const actionBtn = assistantModal.querySelector('#voice-assistant-action-btn');
      if (actionBtn) {
        actionBtn.className = 'btn btn-primary';
        actionBtn.textContent = 'Done';
        actionBtn.onclick = () => this.closeModal();
      }

    } catch (err) {
      console.error('Check balance error:', err);
      this.setState(VOICE_STATES.ERROR, 'Could not retrieve customer balance.');
    }
  },

  /**
   * Update assistant UI state and animation
   */
  setState(state, message) {
    currentState = state;
    if (!assistantModal) return;

    const micCircle = assistantModal.querySelector('#voice-modal-mic-circle');
    const statusText = assistantModal.querySelector('#voice-assistant-status-text');
    const actionBtn = assistantModal.querySelector('#voice-assistant-action-btn');

    if (statusText) {
      statusText.textContent = message;
    }

    if (micCircle) {
      micCircle.className = 'voice-modal-mic-circle';
      if (state === VOICE_STATES.LISTENING) {
        micCircle.classList.add('mic-pulsing-red');
      } else if (state === VOICE_STATES.PROCESSING || state === VOICE_STATES.UNDERSTANDING) {
        micCircle.classList.add('mic-pulsing-blue');
      } else if (state === VOICE_STATES.ERROR) {
        micCircle.classList.add('mic-state-error');
      }
    }

    if (actionBtn) {
      if (state === VOICE_STATES.LISTENING) {
        actionBtn.className = 'btn btn-danger';
        actionBtn.innerHTML = '<span>Stop & Process</span>';
      } else if (state === VOICE_STATES.ERROR) {
        actionBtn.className = 'btn btn-secondary';
        actionBtn.innerHTML = '<span>Try Again</span>';
        actionBtn.onclick = () => {
          this.closeModal();
        };
      }
    }
  },

  /**
   * Render the floating Voice Assistant Modal
   */
  renderModal(language) {
    this.closeModal();

    const modalRoot = document.getElementById('modal-root') || document.body;
    assistantModal = document.createElement('div');
    assistantModal.className = 'modal-backdrop';
    assistantModal.id = 'voice-assistant-modal-backdrop';

    assistantModal.innerHTML = `
      <div class="modal-content" style="max-width: 440px; text-align: center; padding: 2rem 1.5rem;">
        <div style="display: flex; justify-content: flex-end; margin-bottom: 0.5rem;">
          <button type="button" id="voice-assistant-close-x" class="btn btn-secondary btn-sm" style="padding: 0.2rem 0.5rem; min-height: 28px;">✕</button>
        </div>

        <!-- Mic Circle Indicator -->
        <div style="display: flex; justify-content: center; margin-bottom: 1.5rem;">
          <div id="voice-modal-mic-circle" class="voice-modal-mic-circle mic-pulsing-red">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="22"></line>
            </svg>
          </div>
        </div>

        <h3 style="margin-bottom: 0.25rem;">SmartKhata AI Voice Assistant</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
          Listening in <strong>${language}</strong>
        </p>

        <!-- Status message -->
        <div id="voice-assistant-status-text" style="font-size: 0.95rem; font-weight: 600; min-height: 48px; color: var(--text-primary); margin-bottom: 1rem;">
          Listening... Speak now
        </div>

        <!-- Live transcript box -->
        <div id="voice-transcript-box" style="display: none; background: #f8fafc; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.75rem; font-size: 0.9rem; margin-bottom: 1.5rem;">
        </div>

        <!-- Action / Stop button -->
        <div style="display: flex; justify-content: center; gap: 0.75rem;">
          <button type="button" id="voice-assistant-action-btn" class="btn btn-danger btn-lg" style="width: 100%; max-width: 280px;">
            <span>Stop & Process</span>
          </button>
        </div>
      </div>
    `;

    modalRoot.appendChild(assistantModal);

    assistantModal.querySelector('#voice-assistant-close-x').onclick = () => {
      this.cancel();
    };
  },

  /**
   * Cancel and cleanup active voice session
   */
  cancel() {
    clearTimeout(this.autoStopTimer);
    if (activeStream) {
      activeStream.getTracks().forEach(track => track.stop());
      activeStream = null;
    }
    voiceService.stopSpeechRecognitionFallback();
    ttsService.stop();
    currentState = VOICE_STATES.IDLE;
    this.closeModal();
  },

  closeModal() {
    if (assistantModal && assistantModal.parentNode) {
      assistantModal.parentNode.removeChild(assistantModal);
    }
    assistantModal = null;
  }
};

