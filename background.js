// background.js

// === DEFAULT STATE ===
const DEFAULT_STATE = {
  isRunning: false,
  targetTime: null,       // Timestamp when timer ends
  remainingTime: 25 * 60 * 1000, // Time left in milliseconds
  phase: 'focus',         // 'focus' or 'break'
  sessionCount: 1,
  totalSessions: 4,
  settings: {
    focus: 25,
    break: 5,
    sessions: 4
  }
};

// Initialize Storage on Install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['timerState'], (result) => {
    if (!result.timerState) {
      chrome.storage.local.set({ timerState: DEFAULT_STATE });
    }
  });
});

// === ALARM HANDLER (Wakes up extension when time is up) ===
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'flowTimerEnd') {
    handleTimerComplete();
  }
});

function handleTimerComplete() {
  chrome.storage.local.get(['timerState'], (res) => {
    const state = res.timerState || DEFAULT_STATE;
    
    // 1. Send Notification
    try {
      const msg = state.phase === 'focus' ? 'Take a break!' : 'Time to focus.';
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Flow',
        message: msg,
        priority: 2
      });
    } catch (e) {
      console.log("Notification error (missing icon?):", e);
    }

    // 2. Switch Phase Logic
    let nextPhase = state.phase === 'focus' ? 'break' : 'focus';
    let nextDuration = nextPhase === 'focus' ? state.settings.focus : state.settings.break;
    let nextSessionCount = state.sessionCount;

    // Update session count only after a break ends (or however you prefer)
    if (state.phase === 'break') {
      nextSessionCount++;
      if (nextSessionCount > state.settings.sessions) {
        nextSessionCount = 1; // Loop back or stop
      }
    }

    // 3. Reset State for next round (Auto-pause)
    const newState = {
      ...state,
      isRunning: false,
      phase: nextPhase,
      sessionCount: nextSessionCount,
      remainingTime: nextDuration * 60 * 1000,
      targetTime: null
    };

    chrome.storage.local.set({ timerState: newState });
  });
}

// === MESSAGE HANDLER ===
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  chrome.storage.local.get(['timerState'], (res) => {
    let state = res.timerState || DEFAULT_STATE;

    if (req.action === 'START') {
      if (!state.isRunning) {
        const now = Date.now();
        const target = now + state.remainingTime;
        
        state.isRunning = true;
        state.targetTime = target;
        
        // Set System Alarm
        chrome.alarms.create('flowTimerEnd', { when: target });
        
        chrome.storage.local.set({ timerState: state }, () => sendResponse(state));
      } else {
        sendResponse(state);
      }
    } 
    else if (req.action === 'STOP') {
      if (state.isRunning) {
        // Pause: Save remaining time
        const now = Date.now();
        const left = Math.max(0, state.targetTime - now);
        
        state.isRunning = false;
        state.remainingTime = left;
        state.targetTime = null;
        
        chrome.alarms.clear('flowTimerEnd');
        
        chrome.storage.local.set({ timerState: state }, () => sendResponse(state));
      } else {
        sendResponse(state);
      }
    } 
    else if (req.action === 'RESET') {
      chrome.alarms.clear('flowTimerEnd');
      state.isRunning = false;
      state.phase = 'focus';
      state.remainingTime = state.settings.focus * 60 * 1000;
      state.sessionCount = 1;
      
      chrome.storage.local.set({ timerState: state }, () => sendResponse(state));
    }
    else if (req.action === 'UPDATE_SETTINGS') {
      state.settings.focus = req.payload.focus;
      state.settings.break = req.payload.break;
      state.settings.sessions = req.payload.sessions;
      
      // Update current timer if it's not running
      if (!state.isRunning) {
        const currentDur = state.phase === 'focus' ? state.settings.focus : state.settings.break;
        state.remainingTime = currentDur * 60 * 1000;
      }
      
      chrome.storage.local.set({ timerState: state }, () => sendResponse(state));
    }
    else if (req.action === 'GET_STATUS') {
      sendResponse(state);
    }
  });

  return true; // Keep channel open for async
});