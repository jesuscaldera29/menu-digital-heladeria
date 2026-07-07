// js/sounds.js
// Sistema de sonidos UI basado en Web Audio API para una experiencia nativa y moderna
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playTone(freq, type, duration, vol = 0.1) {
  try {
    initAudio();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
  } catch (e) {
    console.warn("Audio not supported or blocked", e);
  }
}

window.uiSounds = {
  click: () => playTone(600, 'sine', 0.05, 0.05),
  add: () => playTone(880, 'sine', 0.1, 0.08),     // High pop (A5)
  remove: () => playTone(300, 'sine', 0.1, 0.05),  // Low pop (D4)
  error: () => {
    playTone(200, 'sawtooth', 0.1, 0.05);
    setTimeout(() => playTone(150, 'sawtooth', 0.2, 0.05), 100);
  },
  success: () => {
    playTone(523.25, 'sine', 0.1, 0.08); // C5
    setTimeout(() => playTone(659.25, 'sine', 0.1, 0.08), 100); // E5
    setTimeout(() => playTone(783.99, 'sine', 0.2, 0.08), 200); // G5
    setTimeout(() => playTone(1046.50, 'sine', 0.4, 0.08), 300); // C6
  }
};

// Global click listener to play generic click sounds
document.addEventListener('click', (e) => {
  // Initialize audio context on first user interaction
  initAudio();
  
  const btn = e.target.closest('button, .category-tab, .option-pill, label.cursor-pointer, a');
  if (btn) {
    // Determine if it's an add/remove/success button based on text or class to avoid overlap
    const text = (btn.textContent || '').toLowerCase();
    const isAdd = btn.classList.contains('add-btn') || text.includes('agregar') || text.includes('+');
    const isRemove = btn.classList.contains('remove-btn') || text.includes('eliminar') || text.includes('−') || text.includes('-');
    const isSuccess = text.includes('completar') || text.includes('pagar') || text.includes('imprimir') || text.includes('enviar') || text.includes('cobrar') || text.includes('guardar');
    
    if (isAdd) {
      window.uiSounds.add();
    } else if (isRemove) {
      window.uiSounds.remove();
    } else if (isSuccess) {
      window.uiSounds.success();
    } else {
      window.uiSounds.click();
    }
  }
});

// Intercept Toast to play error sounds
const originalShowToast = window.showToast;
if (typeof originalShowToast === 'function') {
  window.showToast = function(msg, type = 'success') {
    if (type === 'error') {
      window.uiSounds.error();
    } else {
      // Optional: success sound for toasts? Add is usually better
    }
    return originalShowToast(msg, type);
  };
}
