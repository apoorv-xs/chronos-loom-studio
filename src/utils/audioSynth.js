// Web Audio API Synthesizer for UI feedback sounds
let audioCtx = null;
let isMuted = false;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function setMuteState(muted) {
  isMuted = muted;
}

export function getMuteState() {
  return isMuted;
}

export function playUISound(type) {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    switch (type) {
      case 'click': {
        // High-pitched synth click for link start/end
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);
        
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        
        osc.start(now);
        osc.stop(now + 0.08);
        break;
      }
      case 'connect': {
        // Double-tick synthesizer confirmation for wiring pins
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.setValueAtTime(900, now + 0.04);
        
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        
        osc.start(now);
        osc.stop(now + 0.12);
        break;
      }
      case 'delete': {
        // Deleting node swoosh sound
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
        
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      }
      case 'swell': {
        // Synth swell for entering cinematic/preview play
        const osc = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'triangle';
        osc2.type = 'sine';
        
        osc.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.linearRampToValueAtTime(440, now + 0.4);
        
        osc2.frequency.setValueAtTime(223, now); // slightly detuned
        osc2.frequency.linearRampToValueAtTime(443, now + 0.4);
        
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.15, now + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        
        osc.start(now);
        osc2.start(now);
        osc.stop(now + 0.4);
        osc2.stop(now + 0.4);
        break;
      }
      case 'change': {
        // Small select/value change blip
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.linearRampToValueAtTime(500, now + 0.05);
        
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        
        osc.start(now);
        osc.stop(now + 0.05);
        break;
      }
    }
  } catch (err) {
    console.warn('Web Audio synthesis failed or blocked by autoplay browser restrictions:', err);
  }
}
