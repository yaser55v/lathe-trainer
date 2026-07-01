/**
 * ControllerInputSystem
 * =====================
 * Handles Quest 3 Touch Plus controller button inputs.
 * 
 * Configurable Push-to-Talk Modes:
 * - HOLD: Hold Right Grip to talk (release to send)
 * - TOGGLE: Press Grip to start, press again to stop
 * - ALWAYS_ON: Voice always active (hands-free)
 */

import { createSystem } from "@iwsdk/core";

export type TalkMode = 'hold' | 'toggle' | 'always_on';

export class ControllerInputSystem extends createSystem({}) {
  private isHoldingRightGrip = false;
  private isToggleActive = false;
  private rightController: any = null;
  private talkMode: TalkMode = 'hold'; // Default mode
  private lastGripPress = 0;
  private readonly DEBOUNCE_MS = 300;

  init() {
    // XR session might not exist yet - check safely
    const xrSession = this.world.xr?.session;
    if (xrSession) {
      xrSession.subscribe("change", (session) => {
        if (session) {
          this.setupControllers();
        } else {
          this.cleanup();
        }
      });
    }

    // Listen for talk mode changes from settings
    window.addEventListener('assistant:talk_mode', (e: Event) => {
      const mode = ((e as CustomEvent).detail as any).mode as TalkMode;
      this.setTalkMode(mode);
    });
  }

  private setupControllers() {
    const session = this.world.xr.session.value;
    if (!session) return;

    // Get right controller
    session.addEventListener("inputsourceschange", () => {
      const inputSources = session.inputSources;
      for (const source of inputSources) {
        if (source.handedness === "right" && source.gamepad) {
          this.rightController = source.gamepad;
        }
      }
    });

    // Immediate check for existing input sources
    const inputSources = session.inputSources;
    for (const source of inputSources) {
      if (source.handedness === "right" && source.gamepad) {
        this.rightController = source.gamepad;
      }
    }
  }

  private cleanup() {
    this.rightController = null;
    this.isHoldingRightGrip = false;
    this.isToggleActive = false;
    // If always-on mode was active, stop listening
    if (this.talkMode === 'always_on') {
      this.stopVoiceInput();
    }
  }

  update() {
    if (!this.rightController) return;

    const gamepad = this.rightController;
    
    // Right Grip is typically button index 1
    const gripButton = gamepad.buttons[1];
    if (!gripButton) return;

    const isPressed = gripButton.pressed || gripButton.value > 0.5;

    // Handle based on current talk mode
    switch (this.talkMode) {
      case 'hold':
        this.handleHoldMode(isPressed);
        break;
      case 'toggle':
        this.handleToggleMode(isPressed);
        break;
      case 'always_on':
        // Always listening - no button handling needed
        break;
    }
  }

  private handleHoldMode(isPressed: boolean) {
    // Grip pressed → start voice recording
    if (isPressed && !this.isHoldingRightGrip) {
      this.isHoldingRightGrip = true;
      this.startVoiceInput();
    }
    // Grip released → stop recording and send
    else if (!isPressed && this.isHoldingRightGrip) {
      this.isHoldingRightGrip = false;
      this.stopVoiceInput();
    }
  }

  private handleToggleMode(isPressed: boolean) {
    // Debounced button press detection
    const now = performance.now();
    if (isPressed && !this.isHoldingRightGrip && now - this.lastGripPress > this.DEBOUNCE_MS) {
      this.isHoldingRightGrip = true;
      this.lastGripPress = now;
      
      // Toggle voice on/off
      this.isToggleActive = !this.isToggleActive;
      if (this.isToggleActive) {
        this.startVoiceInput();
      } else {
        this.stopVoiceInput();
      }
    }
    // Track button release for next press
    else if (!isPressed && this.isHoldingRightGrip) {
      this.isHoldingRightGrip = false;
    }
  }

  private startVoiceInput() {
    const service = (this.world.globals as any).assistantService;
    if (!service) return;

    // Visual feedback: dispatch grip press event
    window.dispatchEvent(new CustomEvent('controller:grip_pressed'));

    // Start listening if not already listening
    if (!service.voiceInput?.isListening) {
      service.toggleListening();
    }
  }

  private stopVoiceInput() {
    const service = (this.world.globals as any).assistantService;
    if (!service) return;

    // Visual feedback: dispatch grip release event  
    window.dispatchEvent(new CustomEvent('controller:grip_released'));

    // Stop listening (will trigger transcript send)
    if (service.voiceInput?.isListening) {
      service.toggleListening();
    }
  }

  /**
   * Change talk mode at runtime
   */
  setTalkMode(mode: TalkMode) {
    const prevMode = this.talkMode;
    this.talkMode = mode;
    
    console.log(`[ControllerInput] Talk mode: ${prevMode} → ${mode}`);

    // Handle state transitions
    if (prevMode === 'always_on' && mode !== 'always_on') {
      // Leaving always-on: stop listening
      this.stopVoiceInput();
    } else if (mode === 'always_on' && prevMode !== 'always_on') {
      // Entering always-on: start listening
      this.startVoiceInput();
      // Keep listening active (don't auto-stop)
      window.dispatchEvent(new CustomEvent('assistant:always_on_active'));
    }
    
    // Reset toggle state when switching modes
    if (prevMode === 'toggle') {
      this.isToggleActive = false;
    }
  }
}
