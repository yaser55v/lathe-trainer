# CNC Lathe XR Training Assistant — Complete Project Summary

This document explains the complete architecture, features, and design decisions of the XR training system. No code — just concepts, architecture, and future roadmap.

---

## Project Vision

An immersive XR training environment where users learn CNC lathe operation through natural conversation with a spatial AI companion. The AI understands where you are, what you're looking at, responds in your language, and can physically demonstrate machine operations in real-time 3D.

---

## Core Architecture

### Three-Layer Design

### Layer 0: Skills Layer (Deterministic Logic) — NEW

A critical architectural addition that runs before every LLM request. Instead of giving the model raw data (XYZ coordinates, complex rules, etc.) and hoping it reasons correctly, we now run 7 specialized deterministic TypeScript skills that compute structured facts.

**The 7 Skills:**
- `spatial-skill.ts` — Wraps SpatialAnalyzer and returns clean structured output: `{side, nearest, distance, visibleComponents}` instead of raw coordinates.
- `safety-skill.ts` — Evaluates ISO 13850 door/spindle rules in code and gives the LLM clear pass/fail facts (no more hallucinated safety decisions).
- `machine-skill.ts` — Single source of truth for all runtime machine state.
- `sales-skill.ts` — Hardcoded commercial data (150K–220K€, ±0.005mm precision, 42 min saved per shift, 3× throughput) to completely prevent financial hallucinations.
- `training-skill.ts` — Tracks lesson progress and competency levels.
- `learner-memory-skill.ts` — Persistent localStorage (<50KB). Stores language preference, skill level, completed lessons, common mistakes, and safety score. Never stores full conversations.
- `maintenance-skill.ts` — Keyword-gated deterministic troubleshooting analyser. Maps symptom keywords and Fanuc alarm codes to structured `MaintenanceAnalysis` `{failureType, severity, escalationLevel, safeToContinueOperation, probableCauses, recommendedActions}`. LLM explains but cannot override any field.

**Impact on PromptBuilder:**
- Now accepts skill outputs via `updateSkillInputs()`.
- Spatial & Safety facts replace raw scene context.
- Sales data added as Section 9.
- Learner memory injected only when relevant.
- Maintenance analysis injected as Section 10 — keyword-gated (zero token cost when not triggered).

`AssistantContext` was updated to instantiate and run all 7 skills synchronously before each prompt construction. `canPerformAction()` now delegates to `SafetySkill`.

---

## Current Features

### Conversational AI

**Natural Language Understanding**
- Responds in user's language (English, Italian, Arabic)
- **Strict Language Adherence**: User selects language in UI; AI strictly follows preference.
- Persisted via `LearnerMemorySkill` across sessions.
- Technical terms preserved in English when no translation exists

**Conversational Personality**
- Friendly engineer standing beside the machine (not a documentation page)
- Uses natural acknowledgements: "Good question", "Let me explain", "Exactly"
- Three behavioral modes automatically selected based on intent:
  - Technical Tutor: explains operation, programming, maintenance
  - Consultative Sales: ROI calculations, pricing guidance, SPIN selling
  - Safety Compliance: enforces ISO 13850, refuses dangerous requests

**Context Awareness**
- Knows user's 3D position relative to machine
- Understands which components are visible from user's viewpoint
- Tracks machine state (door open/closed, spindle running, active mode)
- Remembers conversation history for multi-turn discussions
- Updates knowledge with live scene changes every frame

### Voice Input & Output

**Native Audio Input (NEW)**
- **16kHz Resampling**: Web Audio API `resampleToWav` ensures speech is sent at the rate Parakeet expects.
- Fixes "Helium Voice" / 1.5x speed errors.
- **MIME Awareness**: Correctly identifies `audio/wav`, `audio/mpeg`, etc.
- Model understands tone, emotion, hesitation, frustration
- Supports multilingual mixing in same sentence (Italian + English)
- **30s Auto-Stop**: Prevents runaway recordings and context overflow.

**Three Talk Modes**
- Hold: Press and hold Right Grip (Quest 3) or Right-Click (PC) to record
- Toggle: Press once to start, press again to stop (hands-free gesturing)
- Always On: No button needed, voice always active (pro users)

**Text-to-Speech Output**
- Riva TTS for English/Italian (high-quality neural voices)
- Falls back to browser native TTS for Arabic
- Smart voice selection by name (Google US English > Microsoft David > macOS Alex)
- Language detection from AI response text

### Machine Control

**Action Token System**
- AI emits special tokens: `[ACTION:OPEN_DOOR]`, `[ACTION:HIGHLIGHT_CHUCK]`
- Tokens stripped from visible text and TTS
- Executed via action registry after response completes
- Each action fires exactly once per response

**Available Actions**
- OPEN_DOOR / CLOSE_DOOR — physical door animation
- HIGHLIGHT_CHUCK / TAILSTOCK / DOOR / CONTROL_PANEL / TOOL_TURRET / CHIP_CONVEYOR
- HIGHLIGHT_CLEAR — remove all highlights
- DEMO_HOW_IT_WORKS — automated component tour

**Safety Rules**
- AI checks live door state before suggesting door actions
- **Operator Position Constraints**: Operates only if the user is standing in front of the machine; prevents door operation if the user is behind/back of the machine.
- **Operator Reach Constraints**: Enforces a strict 3.0-meter maximum distance limit from the machine to physically reach and operate the door.
- Refuses safety bypass requests (running with door open)
- Cites ISO 13850 standards for compliance

**MaintenanceSkill (NEW)**
- Deterministic maintenance and troubleshooting analyser — no LLM involvement
- Keyword-gated: only activates when the query contains maintenance-related terms (alarm, fault, vibration, leak, etc.)
- Analyses user query and maps it to a `MaintenanceAnalysis` object with:
  - `failureType`: mechanical | electrical | hydraulic | software | safety | unknown
  - `severity`: low | medium | high | critical
  - `escalationLevel`: operator | maintenance | certified_service
  - `safeToContinueOperation`: boolean — injected into prompt as STOP MACHINE directive
  - `probableCauses`, `recommendedActions`, `estimatedRepairTime`, `confidence`
- 10 built-in symptom groups: hydraulic, spindle, E-Stop, door interlock, coolant/conveyor, screen/display, generic alarm, tool wear, temperature, power loss
- Alarm code database placeholder (`ALARM_CODES` map) ready for future expansion
- LLM receives the analysis as `# 10. MAINTENANCE ANALYSIS` and must NOT override any deterministic field
- Architecture prepared for: alarm code database, maintenance manuals, OCR, vibration analysis, predictive maintenance, technician reports, spare parts lookup

### Visual Feedback

**Robot Companion**
- Positioned front-left of machine, scaled 1.8× for visibility
- Four visual states with smooth lerped transitions:
  - Idle: dim, eyes closed, no movement
  - Listening: green-cyan glow, soft bob animation
  - Thinking: blue glow, slow breath, awaiting response
  - Speaking: bright white, fast bob, eyes fully open

**Robot Toolbar**
- Always-visible toggle button (≡) beside robot
- Collapsible pill with 4 buttons:
  - STOP (red) — interrupt conversation immediately
  - Pen — open dev text input
  - Clock — reserved for conversation history
  - Settings — show/hide settings panel

**Settings Panel**
- Voice Response toggle (ON/OFF)
- Auto-Listen toggle (future feature)
- Show Subtitles toggle (future feature)
- Talk Mode selector (Hold / Toggle / Always On)

**Speech Bubble**
- Floats above robot head
- Shows streaming AI response in real-time
- Faces user via Spinner component
- Hidden when robot is idle

### Developer Tools

**Dev Chat Sidebar (Browser Only)**
- Toggle with backtick `` ` `` key or ⌨ button
- Full conversation history display
- Text input for testing without voice
- STOP button for interrupting responses
- Message copy buttons for debugging
- Auto-opens when Pen icon pressed in XR toolbar

**Audio File Upload (NEW)**
- Green 🎙 Audio button in dev sidebar.
- Accepts any audio file and routes it through the resampling pipeline.
- Useful for dev testing without headset/microphone access.

**Scene Context Inspector**
- User position updated every frame
- Spatial analysis shows which component is near/facing
- Machine state visibility (door, spindle, mode)
- Conversation history tracking

### 🔍 Key Technical Insight: Multilingual Audio Capability

While earlier internal documentation summaries suggested the model supported "English only", this was a misconception based on the base text-only model variant. The actual **Nvidia Nemotron Omni** reasoning model integrated into this project is a fully multilingual audio model.

Official documentation confirms it was trained on **127B mixed-modality tokens**, including extensive multilingual speech data. It is benchmarked on VoiceBench (multilingual speech tasks), validating its capability to understand and respond in multiple languages natively, including Arabic, Italian, Spanish, German, Portuguese, Japanese, Chinese, and more.

**Why this matters to the project:**
The earlier inconsistency that led to the "English only" assumption was purely a technical pipeline issue (wrong sample rate and MIME type in the audio resampling, which have since been fixed with `resampleToWav()`). It was never a fundamental language limitation of the AI model itself. This realization validates the project's multi-language architecture and ensures we are fully utilizing the model's native capabilities.

---

## Knowledge Architecture

### Single Source of Truth Design

**CNC_Knowledge.md (Pure Specs)**
- Machine dimensions, spindle specs, tool turret configuration
- Control system details, axes performance, safety systems
- Workpiece capacity, operational features, maintenance intervals
- NO rules, NO personas, NO action tokens — just facts

**PromptBuilder (8-Section System Prompt)**
1. ROLE — XR Digital Twin identity and cognitive model description
2. BEHAVIOR RULES — Core identity, conversation style, three behavioral modes
3. LANGUAGE RULES — Multilingual detection, Arabic quality standards
4. MACHINE KNOWLEDGE — Loaded from CNC_Knowledge.md
5. MACHINE COMPONENT MAP — 6 components with positions, descriptions
6. AVAILABLE ACTIONS — All action tokens with current machine state
7. DEMO RULES — Explicit demo trigger conditions
8. LIVE SCENE CONTEXT — Runtime state, spatial analysis, visibility rules

**Information Priority Order**
1. Live Scene Context (highest priority — current truth)
2. Machine Knowledge (authoritative specs)
3. Component Map (authoritative names/IDs)
4. Conversation History (context but never overrides facts)
5. Screenshot (if provided)
6. Behavior Rules (guidelines)

### Spatial Awareness System

**Deterministic Reasoning**
- No longer relies on the LLM to interpret raw XYZ coordinates.
- `SpatialSkill` converts coordinates into logic: `{side, nearest, distance, visibleComponents}`.
- LLM receives pre-computed facts about what the user can see.

**Position Tracking**
- User head position read every frame (Vector3, zero allocations)
- Machine center at (-0.34, 1.15, -2.88)
- Distance calculated to all 6 components

**Directional Understanding**
- Positive Z = in front of machine
- Negative Z = behind machine (viewing back panel)
- Filters visible components based on position
- Adds context notes when viewing back panel

**Visibility Rules**
- AI told user can ONLY see surfaces they're facing
- Behind machine = back panel (vents/housing), NOT internal components
- "What do I see?" describes only visible external surfaces
- Prevents AI from describing invisible components

**Proximity Detection**
- Each component has proximity radius (1.0–2.7 meters)
- Closest directionally-relevant component becomes "selected"
- "What is this?" refers to selected component
- Selection cleared when not close to anything

---

## Control Systems

### Voice Input Flow

**Quest 3 Controllers**
- Right Grip button (gamepad.buttons[1]) monitored every frame
- Three modes change behavior:
  - Hold: press = start recording, release = stop & send
  - Toggle: press = start, press again = stop & send
  - Always On: auto-start on system init, stop only via STOP button
- Events: controller:grip_pressed / controller:grip_released
- Visual feedback in console overlay (green border pulse)

**PC Testing (Mouse)**
- Right-click mapped to push-to-talk
- Context menu prevented via preventDefault
- Same three-mode support as controllers
- Allows full testing without Quest 3 headset

**Audio Capture**
- MediaRecorder with optimal speech settings
- 16kHz sample rate (speech recognition standard)
- Mono channel (single microphone)
- Echo cancellation + noise suppression enabled
- Format priority: webm/opus > webm > ogg > wav

### STOP Button Implementation

**Two Locations**
- XR Toolbar: red button at top of collapsible pill
- Dev Sidebar: red button above text input

**What It Stops**
- Active API streaming (aborts fetch request)
- Text-to-Speech playback (Riva + Native TTS)
- Voice recording (MediaRecorder stops, mic released)
- Running demo sequence
- All state reset to idle

**Event Flow**
```
User clicks STOP
  ↓
Dispatches: assistant:stop
  ↓
AssistantSystem receives event
  ↓
Calls: service.stop()
  ↓
Everything interrupted
  ↓
Emits: idle state
```

---

## Technical Implementation

### ECS Systems (Entity Component System)

**AssistantSystem**
- Bridges AssistantService and IWSDK world
- Updates scene context every frame
- Routes AI events to presenter and action registry
- Handles window event bus communication
- Wires STOP button event

**RobotSystem**
- Implements VisualStateChannel interface
- Four distinct visual states with lerped transitions
- Controls: emissive intensity, eye scale, bob animation, glow color
- Smooth animation at 60fps

**RobotToolbarSystem**
- Manages two-entity toolbar (toggle + pill)
- Wires button click events
- Shows/hides pill and settings panels
- Dispatches assistant events

**DoorSlideSystem**
- Animates door slide on X-axis
- Public openDoor() / closeDoor() methods
- Updates scene context on start AND settle
- Prevents AI from suggesting already-executed actions

**ControllerInputSystem**
- Quest 3 controller monitoring
- Right Grip button state tracking
- Mode-aware behavior (hold/toggle/always_on)
- Dispatches grip pressed/released events

**MouseInputSystem**
- PC testing alternative to controllers
- Right-click to push-to-talk
- Context menu suppression
- Same mode support as controllers

### Service Layer (Plain TypeScript)

**AssistantContext**
- **Skill Integration**: Instantiates and orchestrates all 6 skills.
- Calls skills synchronously before every `PromptBuilder` build.
- Feeds results to `PromptBuilder` via `updateSkillInputs()`.
- `canPerformAction()` delegates to `SafetySkill` instead of inline checks.

**AssistantService**
- NOT an ECS system — plain class
- Owns: API streaming, history, voice input, TTS
- Event bus emitter for typed AssistantEvent
- Two input methods: send(text) and sendAudio(blob)
- Unified processRequest() handles text + audio + images
- Action token interception via post-stream regex
- Stop method interrupts everything

**AssistantContext**
- Delegates to PromptBuilder
- Query methods for component info
- getCurrentlyHighlighted() returns selected component
- canPerformAction() validates action availability

**PromptBuilder**
- Builds complete 8-section system prompt
- Updates scene context before each request
- Dynamic action list based on machine state
- Injects spatial analysis and visibility rules

**SceneContext**
- Mutable global state object
- Fields: userPosition, selectedComponent, machineState, spatialAnalysis
- Updated by any system (DoorSlideSystem, AssistantSystem)
- Injected into every AI request automatically

**ActionRegistry**
- Simple Map<string, function>
- Register actions after systems initialize
- execute() method with error handling
- Adding new actions is one line

**ScreenshotService**
- Captures WebXR canvas view as base64 PNG
- Used for vision queries ("what button is this?")
- Triggered automatically on vision keywords
- 15-30ms capture time

**SpatialAnalyzer**
- Calculates distance to all components
- Determines user direction (front/back/side of machine)
- Filters relevant components by position
- Generates natural language spatial description

### Presenter Pattern

**RobotPresenter**
- Generic output router (not text-specific)
- Two channel types: VisualStateChannel + TextChannel
- Channels register themselves
- Routes RobotOutputEvent to all channels
- Channels don't know about each other

**Visual State Channels**
- RobotSystem implements this interface
- Future: holographic annotations, AR pointers, sound effects

**Text Channels**
- BubblePanelChannel — 3D speech bubble above robot
- OverlayTextChannel — screen-space console in headset
- Future: floating subtitles, karaoke-style word highlighting

---

## UI Components (UIKitML)

All UI built with IWSDK's Yoga-based layout system (similar to React Native Flexbox).

### Robot Toolbar Suite

**robot-toolbar-toggle.uikitml**
- Single button entity (always visible)
- ≡ icon, white background, subtle shadow
- Parented to robot entity (moves and spins with robot)

**robot-toolbar-pill.uikitml**
- Vertical pill with 4 buttons
- White rounded background
- Icons: CircleStop (red), Pencil, Clock (dimmed), Settings
- Hidden by default, toggled by ≡ button

**robot-settings.uikitml**
- Three toggle switches (Voice Response, Auto-Listen, Show Subtitles)
- Talk Mode selector (3 buttons: Hold, Toggle, Always On)
- Active button styling with background color change
- Appears to left of toolbar pill

### Speech & Console

**robot-bubble.json**
- 3D text panel above robot head
- id="bubble-text" for dynamic updates
- Semi-transparent white background
- Faces user via Spinner

**assistant-console.json** (deprecated — not currently used)
- Screen-space panel at bottom of view
- Status dot with color coding
- Scrollable response text
- Mic toggle button

---

## Scene Architecture

### Machine Layout

**CNC Lathe Model**
- GLB file: wows3.glb
- Center position: (-0.34, 1.15, -2.88)
- 6 named components with real positions extracted via helper
- Shadow casting + receiving on all meshes
- Optimized materials (cached shaders, texture compression)

**Component Positions**
- Chuck: (-1.20, 1.00, -3.02) — front, holding workpiece
- Tailstock: (-0.34, 0.85, -3.06) — opposite end support
- Safety Door: (-0.84, 1.22, -2.88) — front enclosure
- Control Panel: (0.23, 1.49, -1.97) — front operator interface
- Tool Turret: (-0.24, 1.44, -3.45) — 12-station tool changer
- Chip Conveyor: (1.36, 1.03, -2.91) — right side, swarf removal

**Robot Position**
- Front-left of machine where vertical menu was
- Position: (latheBounds.min.x + 0.1, floor, latheBounds.max.z - 0.2)
- Scale: 1.8× (was too small)
- Spinner component for 360° billboard tracking

**Hidden Elements (code preserved)**
- Vertical menu (handle + panel)
- Explore panel with 6 component cards
- AI card panel
- All systems still registered, nothing deleted

### Lighting & Environment

**IBL + Dome Texture**
- HDR: industrial_pipe_and_valve_02_2k.hdr
- IBL intensity: 1.5
- Dome intensity: 1.3, blurriness: 0
- Rotation: [0, 0, 0]

**Directional Light**
- Position: (4, 8, 4)
- Intensity: 0.6
- Shadow map: 1024×1024 PCF soft shadows
- Bias: -0.0005

**Renderer Settings**
- Color space: sRGB
- Tone mapping: ACESFilmic, exposure 1.0
- Framebuffer scale: 1.5× (Quest 3 supersampling for specular detail)

**Ground Plane**
- Invisible geometry for locomotion
- Shadow receiving plane with 40% opacity
- 100m × 100m

---

## Bug Fixes & Problem Solving

**Audio Speed & Pitch Issues (FIXED)**
- **Problem**: AI heard users at 1.5x speed or "helium voice."
- **Cause**: Browser recorded at 24kHz/48kHz while the model expected 16kHz.
- **Solution**: Added `resampleToWav` pipeline using `OfflineAudioContext`.

**Floating Highlights Artifacts (FIXED)**
- **Problem**: Highlights stayed in mid-air when the door opened.
- **Cause**: Highlights were world-space static meshes, not parented to the door.
- **Solution**: `AssistantService` automatically prepends `[ACTION:HIGHLIGHT_CLEAR]` before any door move action.

**Payload Mutation Bug (FIXED)**
- **Problem**: Second audio request failed with "At most 1 audio may be provided."
- **Cause**: `buildPayload()` was mutating `this.history` in place, permanently storing audio blobs.
- **Solution**: Cloned the payload array so history stays as plain text only.

**Context Bloat & Latency (FIXED)**
- **Problem**: Responses became extremely slow after 4-5 messages.
- **Solution**: Implemented `MAX_HISTORY = 10` pruning in `AssistantService`.

### Action Token Leak (FIXED)
**Problem:** Tokens like `[ACTION:OPEN_DOOR]` appeared in visible text and TTS.
**Root Cause:** Per-chunk regex on split SSE tokens. Token split across boundaries missed by regex.
**Solution:** Accumulate full raw response, run single post-stream regex pass. Derive fullText from cleaned rawAccum.
**Refinement**: Skills layer now provides deterministic safety checks before token generation.

### Stateful Regex Bug (FIXED)
**Problem:** Action token detection missed every other occurrence.
**Root Cause:** Module-level `/g` regex has persistent lastIndex state.
**Solution:** Factory function makeActionRE() returns fresh regex instance each time.

### Double Action Execution (FIXED)
**Problem:** Highlights and door actions triggered twice.
**Root Cause:** Both index.ts and AssistantSystem subscribed to action events.
**Solution:** Removed duplicate subscriber from index.ts.

### Poor TTS Quality (FIXED)
**Problem:** English voice sounded robotic/muffled.
**Root Cause:** Browser default voice is low quality.
**Solution:** Priority-based voice selection by name. Google US English > Microsoft David > macOS Alex/Samantha.

### Mic Permission Denial (FIXED)
**Problem:** Error shown in UI when user denies mic access.
**Root Cause:** "not-allowed" error treated as hard failure.
**Solution:** Graceful degradation with console warning, text input remains functional.

### Toolbar Toggle Hidden (FIXED)
**Problem:** Clicking ≡ button hid itself along with pill.
**Root Cause:** Single entity held both toggle and pill.
**Solution:** Split into two separate entities with parent/child relationship.

### Spatial Confusion (FIXED)
**Problem:** AI described internal components when user behind machine.
**Root Cause:** No directional filtering, no visibility rules.
**Solution:** Added directional detection (positive Z = front, negative Z = back). Added CRITICAL VISIBILITY RULES section in prompt. Filter components by direction.

---

## Model Utilization Analysis

### Currently Using (25% of capabilities)

**Text Generation** (90%)
- Streaming responses with reasoning
- Multi-turn conversation
- Action token generation

**Multilingual** (70%)
- English, Italian, Arabic detection and generation
- Technical term preservation

**Basic Reasoning** (40%)
- Intent classification (Technical/Sales/Safety modes)
- Spatial understanding from text descriptions
- Action decision-making

**Single Image Analysis** (15%)
- Screenshot vision queries ("what button is this?")
- Component identification from camera view

**Streaming** (80%)
- SSE-based token-by-token responses
- Real-time UI updates

**Native Audio Input** (NEW - 60%)
- Tone, emotion, hesitation detection
- Multilingual mixing understanding
- Better prosody analysis than text

### NOT Using Yet (75% untapped)

**Video Understanding** (0%)
- Could analyze user demonstrations
- Validate safety procedures in real-time
- "Watch me and tell me if I'm doing this correctly"

**Long Context Window** (1%)
- Model: 256K tokens (~200K words)
- Current: ~2K tokens per request
- Could load ENTIRE machine manual into context
- Could maintain full training session history

**Multimodal Fusion** (0%)
- Model can combine: audio + video + text + images simultaneously
- Currently: text OR text+image (not combined)
- Example: "Listen to this sound [audio] while looking at this part [video]"

**Word-Level Timestamps** (0%)
- Model returns exact timing for each word spoken
- Could sync 3D highlights to exact words
- Could create interactive transcripts (click word → jump to moment)

**Document OCR** (0%)
- Model can read text from images/PDFs
- Example: Point camera at machine label → AI reads serial numbers

**Reasoning Budget** (20%)
- Set to 8192 tokens
- Model can use more for complex multi-step troubleshooting

**Multiple Images** (0%)
- Model accepts multiple images per request
- Could compare before/after states
- Example: "Compare this setup [img1] to this one [img2]"

---

## Future Roadmap

### Phase 1: Enhance Core Experience

**Word-Level Timestamps**
- Parse timing data from API response
- Sync component highlights EXACTLY when AI says the word
- Karaoke-style floating subtitles in XR
- Replay controls (tap word → jump to moment)
- Training analytics (track which words users replay most)

**Component Highlight System**
- Edge outline rendering for each component
- Smooth fade-in/fade-out animations
- Color-coded by action type (info=blue, warning=yellow, danger=red)
- Multiple simultaneous highlights
- Tap-to-dismiss

**Conversation History Panel**
- Accessible via Clock button in toolbar
- Scrollable list of past exchanges
- Timestamps for each turn
- Search/filter functionality
- Export to text file

**Subtitle Display**
- Floating text in 3D space
- Word-by-word appearance synced to TTS
- High-contrast background for readability
- Adjustable size and position
- Toggle on/off in settings

### Phase 2: Advanced Multimodal

**Video Understanding**
- Record user demonstrations (hand movements, tool operations)
- AI validates technique in real-time
- "Watch me load this part — am I doing it right?"
- Identifies safety violations from video
- Generates step-by-step corrections

**Multiple Image Comparison**
- Before/after setup validation
- "Is this the same as the reference image?"
- Part inspection and defect detection
- Compare user setup to correct procedure diagram

**Document OCR Integration**
- Point camera at control panel labels
- AI reads and explains button functions
- Scan QR codes on tools for specifications
- Read handwritten notes from operators

**Long Context Loading**
- Load full 200-page CNC manual into every conversation
- Maintain entire training session history (hours of conversation)
- Reference specific manual sections by page number
- Never lose context across sessions

### Phase 3: Training Features

**Structured Training Modules**
- Guided step-by-step lessons
- Progress tracking and checkpoints
- Competency assessments
- Certificate generation

**Hands-On Exercises**
- "Load a workpiece and I'll watch you" scenarios
- Real-time feedback during execution
- Mistake detection and correction prompts
- Performance scoring

**Safety Drills**
- Emergency stop practice
- Chip guard verification
- Door interlock testing
- Timed response challenges

**Multi-User Sessions**
- Instructor mode (one expert, multiple learners)
- Collaborative problem-solving
- Peer review and feedback
- Team training scenarios

### Phase 4: Production Integration

**Real Machine Connection**
- Read actual G-code programs from machine
- Display real-time axis positions
- Show spindle load and temperature
- Monitor tool wear and part count

**Maintenance Assistant**
- Schedule preventive maintenance
- Walk through lubrication procedures
- Diagnose error codes
- Order replacement parts

**Quality Control**
- Part measurement guidance
- Tolerance verification
- First article inspection support
- Statistical process control charts

**Remote Expert**
- Screen share for remote troubleshooting
- AR annotations from remote instructor
- Voice/video call integration
- Shared whiteboard for diagrams

### Phase 5: Advanced AI

**Predictive Assistance**
- Anticipate next steps based on context
- Suggest optimizations before asked
- Warn about potential mistakes
- Learn user preferences over time

**Custom Training Plans**
- Assess current skill level via quiz
- Generate personalized learning path
- Adjust difficulty dynamically
- Focus on weak areas

**Natural Gesture Recognition**
- Point at component → "what is this?"
- Hand signals for common commands
- Gaze tracking for attention detection
- Body language understanding (confusion, confidence)

**Emotional Intelligence**
- Detect frustration and adjust tone
- Celebrate successes with encouragement
- Provide extra patience when user struggling
- Match energy level (calm for safety, enthusiastic for success)

---

## Design Philosophy

### Key Principles

**1. Real-Time Spatial Awareness**
The AI knows where you are, what you're looking at, and what's happening in the scene. It's not a chatbot with a 3D background — it's a companion living in the same space.

**2. Natural Conversation Over Commands**
No menu diving, no button hunting. Just talk like you would to a human instructor. The AI figures out intent and takes appropriate action.

**3. Progressive Enhancement**
Text input works. Add voice. Add screenshots. Add video. Each layer adds capability without breaking the previous layer.

**4. Extensibility by Design**
Adding features doesn't require rewriting. New action: one line. New output channel: register it. New scene state: add field to context.

**5. Graceful Degradation**
Mic permission denied? Text input still works. Vision API timeout? Response continues. TTS unavailable? Text still displays.

**6. Developer Experience First**
Dev tools aren't an afterthought. Full browser-based testing without headset. Console logging. Event inspection. Hot reload.

### Anti-Patterns Avoided

**❌ Hardcoded state checks everywhere**
✅ Centralized scene context updated automatically

**❌ Direct coupling between AI and 3D systems**
✅ Event bus and presenter pattern decouple layers

**❌ Text-only communication path**
✅ Multimodal from the start (audio input implemented)

**❌ One monolithic "AI system"**
✅ Separated concerns: Service (AI), System (ECS bridge), Presenter (output)

**❌ UI as afterthought**
✅ Robot visual states, toolbar, settings built early

---

## Technology Stack

**XR Framework:** IWSDK 0.3.1 (Three.js + ECS + XR utilities)  
**AI Model:** Nvidia Nemotron-3-nano-omni-30b-a3b-reasoning  
**TTS:** Riva API (Magpie voices) + Browser SpeechSynthesis fallback  
**Voice Input:** MediaRecorder API (native audio capture)  
**UI Layout:** UIKitML (Yoga Flexbox) with Lucide icons  
**3D Assets:** GLTF/GLB models with PBR materials  
**Rendering:** Three.js with ACESFilmic tone mapping  
**Build System:** Vite 7.1.4 with TypeScript 5.5  
**Package Manager:** pnpm with workspace overrides  

---

## Performance Considerations

**Frame Budget**
- AssistantSystem: 1 Vector3 read per frame (~0.02ms)
- RobotSystem: 3 lerps + 1 sin() per frame (~0.05ms)
- No per-frame allocations (reused Vector3 instances)

**API Streaming**
- Token-by-token updates (< 100ms first token)
- Visible text stripped of action tokens in real-time
- Post-stream regex pass is O(n) on response length

**Audio Performance**
- MediaRecorder captures at 16kHz mono (minimal bandwidth)
- WebM/Opus compression (~6KB per second of speech)
- Base64 encoding overhead: ~33% size increase
- TTS audio streaming (no large file downloads)

**Memory Management**
- Conversation history grows unbounded (clear manually)
- Consider limiting to last N messages in production
- Screenshot capture allocates blob temporarily (released after send)

---

## Project Status

### ✅ Completed Features
- Native audio input with tone/emotion understanding
- Three talk modes (Hold/Toggle/Always On)
- STOP button in both XR toolbar and dev sidebar
- Conversational AI personality with three behavioral modes
- Spatial awareness and visibility rules
- Action token system with door control
- Robot visual states with smooth animations
- Multilingual support (English, Italian, Arabic)
- TTS with smart voice selection
- Screenshot vision queries
- Dev chat sidebar for browser testing
- Settings panel with voice/subtitle toggles

### 🚧 In Progress
- Component highlight rendering system
- Word-level timestamp parsing
- Conversation history panel

### 📋 Planned Features
- Video understanding for demonstrations
- Multiple image comparison
- Document OCR integration
- Long context window utilization
- Structured training modules
- Real machine connection
- Remote expert collaboration

---

## Success Metrics

### User Experience
- Time to first response: < 2 seconds
- Voice input accuracy: > 95% in quiet environment
- Language switch fluidity: seamless (no announced switches)
- STOP button effectiveness: immediate interrupt within 100ms

### AI Performance
- Correct action token generation: > 98%
- Spatial awareness accuracy: user can say "what is this?" and AI identifies correctly
- Safety refusal rate: 100% for dangerous requests
- Multilingual quality: native-level fluency per language

### System Reliability
- API uptime: > 99.5%
- TTS fallback success: 100% (native always works)
- Voice permission denial: graceful degradation with console warning
- Frame rate: stable 72fps on Quest 3

### Training Effectiveness
- Time to complete first lesson: < 15 minutes
- Knowledge retention after 1 week: > 80%
- User satisfaction score: > 4.5/5
- Reduction in on-site training time: > 40%

---

## Latest Addition: Web Share Target (PWA Vision)

### What We Built Today
To solve the WebXR limitation where `canvas.toDataURL()` returns a blank image (because the Meta Quest compositor handles the camera passthrough, not WebGL), we implemented a native OS-level "Share to App" pipeline using Progressive Web App (PWA) technologies.

**The Architecture:**
1. **PWA Manifest**: Configured `vite-plugin-pwa` with a `share_target` array to register the app with the Meta Quest OS as an image-receiving destination.
2. **Service Worker (`sw.ts`)**: A custom worker intercepts `POST /share-target` requests when the OS sends an image. It extracts the file and uses `postMessage` to beam it directly into the running WebXR application.
3. **Multipart AI Payload**: `AssistantService` was updated to securely attach the image bytes alongside the user's text prompt in a strict format required by the Vision LLM, preventing silent `400 Bad Request` API failures.
4. **Dev Overlay Support**: Re-added the 🖼 Image upload button in the desktop dev console (`\``) so developers without headsets can test the exact same multimodal payload logic by attaching images to their text prompts.

### How Users Will Use This (In VR)
1. **Installation**: The user navigates to the app in the Meta Quest Browser and clicks "Install" in the URL bar to register it as a PWA.
2. **Trigger**: The user asks Riven a vision question (e.g., "What is this?").
3. **Guide**: Riven pops up a UI bubble instructing the user to take a native system screenshot by pressing **Meta Button + Right Trigger**.
4. **Share**: The Meta OS notification pops up with the screenshot. The user clicks **Share** and selects "Lathe Trainer".
5. **Analysis**: The image is seamlessly intercepted by the Service Worker, beamed into the 3D world, and sent to the AI for analysis alongside the user's context.

---

## Contact & Documentation

**Project Repository:** /Users/yassermahmoud/Desktop/Projects/lathe-trainer  
**Knowledge Base:** /public/CNC_Knowledge.md  
**UI Definitions:** /ui/*.uikitml  
**Core Services:** /src/services/  
**ECS Systems:** /src/systems/  
**3D Assets:** /public/gltf/  

For technical implementation details, see inline code documentation and TypeScript type definitions.

