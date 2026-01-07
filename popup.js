// popup.js

// === DOM ELEMENTS ===
const timerDisplay = document.getElementById('timer');
const phaseLabel = document.getElementById('phaseLabel');
const playPauseBtn = document.getElementById('playPauseBtn');
const resetBtn = document.getElementById('resetBtn');
const sessionCountDisplay = document.getElementById('sessionCountDisplay');
const progressDots = document.getElementById('progressDots');
const menuBtn = document.getElementById('menuBtn');
const optionsPanel = document.getElementById('optionsPanel');

// Inputs
const focusInput = document.getElementById('focusDurationInput');
const breakInput = document.getElementById('breakDurationInput');
const sessionInput = document.getElementById('sessionCountInput');

// === 1. DISPLAY LOGIC (The "Reader") ===

function formatTime(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function updateUI(state) {
  if (!state) return;

  // Calculate milliseconds to show
  let displayMs = state.remainingTime;
  if (state.isRunning && state.targetTime) {
    displayMs = Math.max(0, state.targetTime - Date.now());
  }

  // Update Text
  timerDisplay.textContent = formatTime(displayMs);
  phaseLabel.textContent = state.phase === 'focus' ? 'Focus' : 'Break';
  
  if (sessionCountDisplay) {
    sessionCountDisplay.textContent = `${state.sessionCount} of ${state.settings.sessions}`;
  }

  // Update Buttons & Visuals
  if (state.isRunning) {
    playPauseBtn.classList.add('primary');
    playPauseBtn.innerHTML = '&#10074;&#10074;'; // Pause Symbol
    timerDisplay.classList.add('running');
  } else {
    playPauseBtn.classList.remove('primary');
    playPauseBtn.innerHTML = '&#9658;'; // Play Symbol
    timerDisplay.classList.remove('running');
  }
  
  renderDots(state.sessionCount, state.settings.sessions);
}

function renderDots(current, total) {
  if (!progressDots) return;
  progressDots.innerHTML = '';
  // CSS handles the connecting line via ::before
  for (let i = 1; i <= total; i++) {
    const dot = document.createElement('div');
    let cls = 'dot';
    if (i < current) cls += ' completed';
    else if (i === current) cls += ' active';
    else cls += ' upcoming';
    dot.className = cls;
    progressDots.appendChild(dot);
  }
}

// === 2. MAIN LOOP (Updates UI every second) ===

// Poll storage every second to update the countdown
setInterval(() => {
  chrome.storage.local.get(['timerState'], (res) => {
    if (res.timerState) {
      updateUI(res.timerState);
    }
  });
}, 1000);

// Initial Load on Popup Open
chrome.storage.local.get(['timerState'], (res) => {
  if (res.timerState) {
    const s = res.timerState;
    updateUI(s);
    // Init Inputs
    if(focusInput) focusInput.value = s.settings.focus;
    if(breakInput) breakInput.value = s.settings.break;
    if(sessionInput) sessionInput.value = s.settings.sessions;
  } else {
    // If empty, ask background to init
    chrome.runtime.sendMessage({ action: 'GET_STATUS' });
  }
});

// === 3. BUTTON CLICK HANDLERS ===

playPauseBtn.addEventListener('click', () => {
  chrome.storage.local.get(['timerState'], (res) => {
    const s = res.timerState;
    const action = (s && s.isRunning) ? 'STOP' : 'START';
    chrome.runtime.sendMessage({ action: action }, (newState) => {
      updateUI(newState);
      playClickSound();
    });
  });
});

resetBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'RESET' }, (newState) => {
    updateUI(newState);
  });
});

// Toggle Settings Menu
menuBtn.addEventListener('click', () => {
  optionsPanel.classList.toggle('hidden');
});

// === 4. STEPPER LOGIC (Settings) ===

document.querySelectorAll('.stepper-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const action = e.currentTarget.dataset.action;
    const target = e.currentTarget.dataset.target;
    
    // Map targets to inputs
    const input = target === 'focus' ? focusInput : 
                  target === 'break' ? breakInput : sessionInput;
                  
    let val = parseInt(input.value);
    if (action === 'increase') val++;
    else val--;
    
    // Clamp values (Min 1, Max 60 for minutes, Max 12 for sessions)
    val = Math.max(1, val);
    if(target !== 'sessions') val = Math.min(60, val);
    if(target === 'sessions') val = Math.min(12, val);

    input.value = val;

    // Send update to background
    chrome.runtime.sendMessage({
      action: 'UPDATE_SETTINGS',
      payload: {
        focus: parseInt(focusInput.value),
        break: parseInt(breakInput.value),
        sessions: parseInt(sessionInput.value)
      }
    }, (newState) => updateUI(newState));
  });
});

// === 5. SOUND UTILS ===
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playClickSound() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.frequency.value = 600;
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.1);
}

// === 6. KEYBOARD SHORTCUTS ===
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input')) return;
  if (e.code === 'Space') { e.preventDefault(); playPauseBtn.click(); }
  if (e.code === 'KeyR') { e.preventDefault(); resetBtn.click(); }
  if (e.code === 'KeyS') { e.preventDefault(); menuBtn.click(); }
  if (e.code === 'Escape') { optionsPanel.classList.add('hidden'); }
});