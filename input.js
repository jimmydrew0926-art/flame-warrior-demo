(function (root) {
  'use strict';

  const KEYS = {
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    ShiftLeft: 'boost', ShiftRight: 'boost', Space: 'jump', KeyV: 'transform',
    KeyJ: 'sword', KeyK: 'fire', KeyL: 'missile', KeyQ: 'pulse'
  };
  const ACTIONS = ['left', 'right', 'boost', 'jump', 'transform', 'sword', 'fire', 'missile', 'pulse'];
  const EDGES = new Set(['jump', 'transform', 'pulse']);
  const CALLBACKS = { Escape: 'pause', KeyM: 'mute', Enter: 'start', KeyC: 'coin' };
  const CALLBACK_NAMES = { pause: 'onPause', mute: 'onMute', start: 'onStart', coin: 'onCoin' };

  function isInteractive(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tag = String(target.tagName || '').toUpperCase();
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'SUMMARY'].includes(tag)) return true;
    return Boolean(target.closest && target.closest('input, textarea, select, button, a[href], summary, [contenteditable="true"], [role="button"]'));
  }

  // read() consumes jump/transform/pulse taps; attacks and boost also remain true while held.
  // Joystick knob should be positioned at left/top: 50%; .is-pressed marks held touch controls.
  class Controller {
    constructor(options = {}) {
      this.options = options;
      this.joystick = options.joystick || null;
      this.knob = options.knob || null;
      this.keys = new Set();
      this.pending = new Map();
      this.pointers = new Map();
      this.joystickPointer = null;
      this.direction = 0;
      this.listeners = [];
      this.destroyed = false;
      this.buttons = Array.from(options.buttons || []);
      this.window = options.window || root;
      this.document = options.document || this.window.document;
      this.listen(this.window, 'keydown', event => this.keyDown(event));
      this.listen(this.window, 'keyup', event => this.keys.delete(event.code));
      this.listen(this.window, 'blur', () => this.clear());
      if (this.document) this.listen(this.document, 'visibilitychange', () => {
        if (this.document.hidden) this.clear();
      });
      if (this.joystick) {
        this.listen(this.joystick, 'pointerdown', event => this.joystickDown(event));
        this.listen(this.joystick, 'pointermove', event => this.joystickMove(event));
        this.listen(this.joystick, 'pointerup', event => this.release(event));
        this.listen(this.joystick, 'pointercancel', event => this.release(event));
        this.listen(this.joystick, 'lostpointercapture', event => this.release(event));
      }
      for (const button of this.buttons) {
        const action = button.dataset ? button.dataset.action : button.getAttribute('data-action');
        this.listen(button, 'pointerdown', event => this.buttonDown(button, action, event));
        this.listen(button, 'pointerup', event => this.release(event));
        this.listen(button, 'pointercancel', event => this.release(event));
        this.listen(button, 'lostpointercapture', event => this.release(event));
        this.listen(button, 'click', event => {
          // Native keyboard/assistive clicks have no pointerdown, so support a single tap.
          if (event.detail === 0) this.activate(action, event);
        });
      }
      this.resetKnob();
    }

    listen(target, type, handler) {
      target.addEventListener(type, handler, { passive: false });
      this.listeners.push({ target, type, handler });
    }

    playing() {
      return !this.destroyed && (!this.options.isPlaying || this.options.isPlaying());
    }

    keyDown(event) {
      if (this.destroyed || isInteractive(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      const action = KEYS[event.code];
      const callback = CALLBACKS[event.code];
      if (!action && !callback) return;
      if (action && !this.playing()) return;
      if (callback === 'start' && this.playing()) return;
      const callbackName = CALLBACK_NAMES[callback];
      if (callback && typeof this.options[callbackName] !== 'function') return;
      event.preventDefault();
      if (event.repeat || this.keys.has(event.code)) return;
      this.keys.add(event.code);
      if (action) this.pending.set(`key:${event.code}`, action);
      else this.options[callbackName](event);
    }

    activate(action, event, source = `click:${action}`) {
      if (this.destroyed) return false;
      if (ACTIONS.includes(action)) {
        if (!this.playing()) return false;
        this.pending.set(source, action);
        return true;
      }
      const handler = this.options[CALLBACK_NAMES[action]];
      if (typeof handler === 'function') {
        handler(event);
        return true;
      }
      if (typeof this.options.onAction === 'function') {
        this.options.onAction(action, event);
        return true;
      }
      return false;
    }

    capture(element, pointerId) {
      try { element.setPointerCapture(pointerId); } catch (_) { /* Pointer may already have ended. */ }
    }

    joystickDown(event) {
      if (!this.playing() || event.button > 0) return;
      event.preventDefault();
      if (this.joystickPointer !== null) return;
      this.joystickPointer = event.pointerId;
      this.pointers.set(event.pointerId, { element: this.joystick, action: 'joystick' });
      this.capture(this.joystick, event.pointerId);
      this.joystick.classList.add('is-pressed');
      this.joystickMove(event);
    }

    joystickMove(event) {
      if (event.pointerId !== this.joystickPointer) return;
      event.preventDefault();
      const rect = this.joystick.getBoundingClientRect();
      const knobRect = this.knob ? this.knob.getBoundingClientRect() : { width: 0, height: 0 };
      const radius = Math.max(1, Math.min(rect.width, rect.height) / 2 - Math.max(knobRect.width, knobRect.height) / 2 - 5);
      let x = event.clientX - rect.left - rect.width / 2;
      let y = event.clientY - rect.top - rect.height / 2;
      const length = Math.hypot(x, y);
      if (length > radius) { x *= radius / length; y *= radius / length; }
      const horizontal = x / radius;
      const deadzone = this.options.deadzone === undefined ? 0.22 : this.options.deadzone;
      this.direction = horizontal < -deadzone ? -1 : horizontal > deadzone ? 1 : 0;
      if (this.knob) this.knob.style.transform = `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px))`;
    }

    buttonDown(button, action, event) {
      if (this.destroyed || event.button > 0 || (ACTIONS.includes(action) && !this.playing())) return;
      event.preventDefault();
      if (this.pointers.has(event.pointerId)) return;
      this.pointers.set(event.pointerId, { element: button, action });
      this.capture(button, event.pointerId);
      button.classList.add('is-pressed');
      button.setAttribute('aria-pressed', 'true');
      // Two fingers on one control keep it held without retriggering an edge action.
      const alreadyHeld = Array.from(this.pointers.values()).filter(pointer => pointer.action === action).length > 1;
      if (!alreadyHeld) this.activate(action, event, `pointer:${event.pointerId}`);
    }

    release(event) {
      const pointer = this.pointers.get(event.pointerId);
      if (!pointer) return;
      event.preventDefault();
      this.pointers.delete(event.pointerId);
      if (event.type === 'pointercancel' || event.type === 'lostpointercapture') this.pending.delete(`pointer:${event.pointerId}`);
      if (event.pointerId === this.joystickPointer) {
        this.joystickPointer = null;
        this.direction = 0;
        this.resetKnob();
      }
      if (!Array.from(this.pointers.values()).some(held => held.element === pointer.element)) {
        pointer.element.classList.remove('is-pressed');
        pointer.element.setAttribute('aria-pressed', 'false');
      }
      try {
        if (pointer.element.hasPointerCapture(event.pointerId)) pointer.element.releasePointerCapture(event.pointerId);
      } catch (_) { /* Capture is already lost on pointercancel. */ }
    }

    resetKnob() {
      if (this.knob) this.knob.style.transform = 'translate(-50%, -50%)';
    }

    read() {
      const result = Object.fromEntries(ACTIONS.map(action => [action, false]));
      if (!this.playing()) { this.clear(); return result; }
      const held = new Set(Array.from(this.keys, code => KEYS[code]));
      const pending = new Set(this.pending.values());
      for (const pointer of this.pointers.values()) held.add(pointer.action);
      for (const action of ACTIONS) {
        result[action] = EDGES.has(action) ? pending.has(action) : held.has(action) || pending.has(action);
      }
      if (this.direction < 0) result.left = true;
      if (this.direction > 0) result.right = true;
      this.pending.clear();
      return result;
    }

    clear() {
      this.keys.clear();
      this.pending.clear();
      for (const pointerId of Array.from(this.pointers.keys())) this.release({ pointerId, preventDefault() {} });
      this.joystickPointer = null;
      this.direction = 0;
      this.resetKnob();
    }

    destroy() {
      this.clear();
      for (const { target, type, handler } of this.listeners) target.removeEventListener(type, handler);
      this.listeners.length = 0;
      this.destroyed = true;
    }
  }

  root.FlameInput = { Controller };
  if (typeof module !== 'undefined' && module.exports) module.exports = { Controller };
})(typeof window !== 'undefined' ? window : globalThis);
