/**
 * MouseInputSystem
 * ================
 * PC testing alternative for push-to-talk.
 * Right-click to talk (simulates Right Grip controller button).
 */

import { createSystem } from "@iwsdk/core";

export class MouseInputSystem extends createSystem({}) {
  private isRightMouseDown = false;

  init() {
    // Right mouse button for push-to-talk testing on PC
    window.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 2) { // Right mouse button
        e.preventDefault();
        if (!this.isRightMouseDown) {
          this.isRightMouseDown = true;
          this.startVoiceInput();
        }
      }
    });

    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button === 2) { // Right mouse button
        e.preventDefault();
        if (this.isRightMouseDown) {
          this.isRightMouseDown = false;
          this.stopVoiceInput();
        }
      }
    });

    // Prevent context menu on right-click
    window.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
    });
  }

  private startVoiceInput() {
    const service = (this.world.globals as any).assistantService;
    if (!service) return;

    // Visual feedback
    window.dispatchEvent(new CustomEvent('controller:grip_pressed'));

    // Start listening
    if (!service.voiceInput?.isListening) {
      service.toggleListening();
    }
  }

  private stopVoiceInput() {
    const service = (this.world.globals as any).assistantService;
    if (!service) return;

    // Visual feedback
    window.dispatchEvent(new CustomEvent('controller:grip_released'));

    // Stop listening
    if (service.voiceInput?.isListening) {
      service.toggleListening();
    }
  }
}
