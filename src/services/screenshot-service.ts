/**
 * ScreenshotService
 * =================
 * Captures WebXR view screenshots for vision-based AI queries.
 */

export class ScreenshotService {
  private renderer: any;
  private camera: any;

  constructor(renderer: any, camera: any) {
    this.renderer = renderer;
    this.camera = camera;
  }

  /**
   * Triggers the guide to help the user take a native system screenshot
   * and share it to the PWA.
   */
  triggerScreenshotGuide(): void {
    // We dispatch an event that the AssistantSystem can catch to show the bubble
    window.dispatchEvent(new CustomEvent("assistant:screenshot_guide"));
  }
}
