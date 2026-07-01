# Push-to-Talk & Screenshot Implementation

## Features Implemented

### 1. Screenshot Capture System
**File:** `src/services/screenshot-service.ts`

- Captures current WebXR view as base64 PNG image
- Used for vision-based AI queries
- Integrated into AssistantService

**Usage:**
- Automatic capture when vision keywords detected:
  - "What am I pointing at?"
  - "What button is this?"
  - "Identify this part"
  - "Which component..."
- Manual capture via `includeScreenshot` parameter

**Integration:**
- Screenshot service created in `index.ts` with renderer/camera
- Passed to AssistantService constructor
- Multimodal messages sent to Nvidia API when image included

### 2. Configurable Push-to-Talk Modes
**File:** `src/systems/controller-input-system.ts`

**Button:** Right Grip (RG) button on Quest 3 Touch Plus controller

**Three Modes:**

#### Mode 1: HOLD (Default)
- **Press & Hold** Right Grip → Voice recording active
- **Release** Right Grip → Stop & send transcript
- ✅ Best for quick questions
- ✅ Clear start/end boundaries

#### Mode 2: TOGGLE
- **Press** Right Grip → Start recording
- **Press again** → Stop & send transcript  
- ✅ Hands completely free while talking
- ✅ Can point and gesture freely
- ✅ Perfect for explaining while demonstrating

#### Mode 3: ALWAYS ON
- Voice input continuously active
- No button press needed
- ✅ Fastest interaction (like real conversation)
- ✅ Both hands free for work
- ✅ Pro users mode
- ⚠️ May pick up background noise

**Why Right Grip?**
✅ Most accessible (finger naturally rests there)
✅ Won't interfere with pointing (trigger stays free)
✅ Won't conflict with system gestures (A/B/X/Y)
✅ Natural "squeeze to talk" gesture like walkie-talkie

**Visual Feedback:**
- Mic button in console panel pulses green when active
- Status indicator shows "Listening..." state
- Events: `controller:grip_pressed` / `controller:grip_released`

### 3. Settings Panel Integration
**File:** `ui/robot-settings.uikitml`

**New Setting Added:**
```
Talk Mode
├─ Hold      (squeeze to talk)
├─ Toggle    (hands-free while explaining)
└─ Always On (continuous listening)
```

**Access Settings:**
1. Press ≡ button on robot
2. Press ⚙ Settings icon  
3. Select Talk Mode: Hold / Toggle / Always On

### 4. Robot Click Removed
**Changed:** `src/systems/assistant-system.ts`

- Removed robot hotspot click → voice toggle behavior
- Voice input now exclusively controlled by Right Grip button
- Robot can still be grabbed and moved

## Files Modified

### New Files
1. `src/services/screenshot-service.ts` - Screenshot capture
2. `src/systems/controller-input-system.ts` - Controller input handling

### Modified Files
1. `src/index.ts` - Integrated both systems
2. `src/services/assistant-service.ts` - Added screenshot & vision query detection
3. `src/systems/assistant-system.ts` - Removed robot click voice toggle
4. `src/overlay/assistant-overlay.ts` - Added grip button visual feedback
5. `ui/robot-settings.uikitml` - Added Talk Mode selector
6. `src/systems/robot-toolbar-system.ts` - Wired talk mode buttons

## Testing Guide

### Push-to-Talk Testing (Quest 3)

**HOLD Mode (Default):**
1. Put on Quest 3 headset
2. Hold **Right Grip** button (squeeze right controller)
3. Speak: "What is the Chuck used for?"
4. Release grip → AI responds

**TOGGLE Mode (Recommended for Engineers):**
1. Open Settings → Select "Toggle" mode
2. Press Right Grip once → Recording starts (green pulse)
3. Both hands now free to point and gesture
4. Say: "Show me the safety features" (while pointing)
5. Press Right Grip again → Stops & sends to AI

**ALWAYS ON Mode (Pro Users):**
1. Open Settings → Select "Always On"
2. No button needed - just speak naturally
3. Say: "Give me a tour of the machine"
4. AI responds immediately
5. Perfect for continuous conversations

### Screenshot Testing
1. Point at control panel
2. Hold Right Grip (any mode)
3. Say: "What button am I pointing at?"
4. Release grip → Screenshot captured + AI analyzes image

### Fallback Testing (No Quest 3)
- Dev textarea still works (` key or toggle button)
- Robot click removed (use dev chat for PC testing)
- Screenshot captures 2D canvas view

## Controller Button Layout Reference

**Quest 3 Touch Plus Right Controller:**
```
     (B)  (A)
        ||
    [Thumbstick]
        
    [Trigger] ← Index finger (pointing/clicking)
    
    [Grip] ← Middle/Ring fingers (PUSH-TO-TALK)
```

## Vision Query Examples

**Automatic screenshot capture triggers:**
- "What am I pointing at?"
- "What button is this?"
- "Identify this component"
- "What part am I looking at?"
- "Which control does X?"
- "Show me where the Y is"

**Spatial queries (NO screenshot):**
- "Where is the Chuck?" → Geometric analysis only
- "How far am I from the door?" → Position calculation
- "What's nearby?" → Proximity detection

## Benefits

### Configurable Talk Modes
- ✅ **HOLD**: Quick questions, clear boundaries
- ✅ **TOGGLE**: Hands-free explaining while demonstrating  
- ✅ **ALWAYS ON**: Natural conversation flow for experts
- ✅ Users choose based on task and preference
- ✅ Solves the "can't point while talking" problem

### Screenshot System
- ✅ Visual component identification
- ✅ UI button recognition
- ✅ Safety validation before actions
- ✅ Only captures when needed (not every frame)
- ✅ ~15-30ms capture vs continuous analysis

## Real-World Scenarios

### Scenario 1: Quick Question (HOLD Mode)
```
Engineer near Chuck:
1. Hold Right Grip
2. "What RPM range?"
3. Release → AI: "500-3000 RPM"
```

### Scenario 2: Teaching New Operator (TOGGLE Mode)
```
Trainer explaining startup:
1. Press Right Grip (recording starts)
2. Point at power button: "First, press this green button"
3. Point at door: "Then close the safety door"
4. Point at start: "Finally hit this to begin"
5. Press Right Grip → AI confirms steps
```

### Scenario 3: Maintenance Inspection (ALWAYS ON)
```
Technician walking around machine:
- "Check the chip conveyor" → AI highlights it
- "Show me lubrication points" → AI marks them
- "What's the maintenance schedule?" → AI explains
Continuous conversation, no button presses needed
```

## User Feedback from Meta Quest AI

**Original Problem:**
> "العيب الوحيد: إيدك اليمين هتبقى مشغولة وانت بتتكلم."
> (Your right hand will be busy while talking)
> "لو المهندس محتاج يشاور على حاجة وهو بيشرح، مش هيعرف."
> (If engineer needs to point while explaining, he can't)

**Solution Implemented:**
> "الحل: خليه Configurable."
> Settings > Talk Mode: [ Hold ] [ Toggle ] [ Always On ]
> "الـPro Users هيختاروا Always On بعد ما يتعودوا."
> (Pro users will choose Always On after they get used to it)

✅ **SOLVED** - Toggle and Always On modes free both hands completely

## Future Enhancements

1. **Haptic Feedback** - Vibrate controller when grip pressed
2. **Visual Raycast** - Show laser pointer during voice input
3. **Long Press Options** - Different durations trigger different modes
4. **Grip + Trigger Combo** - Screenshot on demand without voice
5. **Hand Tracking Fallback** - Pinch gesture for push-to-talk
6. **Voice Activity Detection** - Auto-stop when user finishes speaking (Always On mode)

## 🚀 Ready to Test!

The system now:
- ✅ Three configurable talk modes (Hold/Toggle/Always On)
- ✅ Screenshot capture for vision queries
- ✅ Settings panel integration
- ✅ Hands-free operation for engineers explaining
- ✅ Works with Quest 3 Touch Plus controllers
- ✅ Visual feedback when grip pressed
