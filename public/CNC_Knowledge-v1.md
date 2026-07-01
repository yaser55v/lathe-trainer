# CNC Turning Center - Knowledge Base for VR Training

## 1. Machine Overview
**Type:** CNC Turning Center - Multi-task turning and milling machine  
**Primary Use:** High-precision turning + milling of complex parts in a single setup  
**Industry Standard:** Common machine type used in technical institutes and precision workshops across Northern Italy  
**Note:** This is a generic representation inspired by modern turning centers. Not affiliated with any specific manufacturer.

---

## 2. Physical Dimensions & Specifications

| Item | Typical Value | Note for VR |
| --- | --- | --- |
| **External Dimensions L×W×H** | 2800 × 1950 × 2100 mm | Use 1:1 scale in VR. 2.1m height |
| **Weight** | 6500 kg | Explains machine rigidity |
| **Max Turning Diameter** | 450 mm | Standard work envelope |
| **Max Turning Length** | 600 mm | Main work envelope |
| **Spindle Center Height** | 1100 mm from floor | Trainee stands directly in front |
| **Door Opening Width** | 850 mm | Setup access area |

---

## 3. Core Technologies

### 3.1 Control System
- **HMI:** Modern touch-based HMI panel
- **CNC Controller:** Industry-standard Siemens-type controller architecture
- **Screen:** 19" Multi-touch display
- **OS:** Windows-based industrial OS

### 3.2 Axes
- **X, Z:** Main turning axes
- **Y-Axis:** Off-center milling ±50mm
- **C-Axis:** Spindle rotates as rotary axis for milling
- **B-Axis:** Tool turret tilts ±45° for angular drilling

### 3.3 Tool Turret
- **Stations:** 12-position standard interface
- **Live Tools:** 6 positions with 6000 RPM milling capability
- **Tool Change Time:** ~0.5 sec Chip-to-Chip

### 3.4 Main Spindle - Full Technical Specs
- **Type:** Hydraulic 3-Jaw Chuck, A2-8 Spindle Nose
- **Max Speed:** 4000 RPM
- **Motor Power:** 22 kW / 30 HP S1 continuous
- **Torque:** 650 Nm @ 1000 RPM, 350 Nm @ 4000 RPM  
- **Clamping Force:** 120 kN hydraulic
- **Bar Capacity:** 65 mm through-spindle bore
- **Runout:** ≤ 0.005 mm TIR at spindle nose
- **Acceleration:** 0-4000 RPM in 3.2s
- **Brake Time:** 4000-0 RPM in 2.8s
- **Encoder:** 1M pulses/rev for C-axis positioning
- **Note:** Values are typical for mid-size turning centers. Always verify with manufacturer plate.

---

## 4. Main Parts - Glossary

| Italian Name | English Name | Training Purpose | Location in 3D |
| --- | --- | --- | --- |
| **Pannello di Controllo** | Control Panel | Primary interaction point | On swing arm, right side |
| **Mandrini Idraulico** | Hydraulic Chuck | Holds raw workpiece | Inside work area |
| **Torretta Portautensili** | Tool Turret | Holds all tools | Above spindle |
| **Contropunta** | Tailstock | Supports long parts | Opposite of chuck |
| **Porta Automatica** | Automatic Door | Safety - must be closed | Front of machine |
| **Convogliatore Trucioli** | Chip Conveyor | Removes chips | Bottom of machine |
| **Pedale Mandrino** | Chuck Foot Pedal | Opens/closes chuck | Floor, left side |

---

## 5. Control Panel - Key Screens for Training

### 5.1 JOG Mode
- **Function:** Manual axis movement X, Z, Y
- **Key Buttons:** X+, X-, Z+, Z-, Feed Override
- **VR Lesson:** "Move the turret 10mm left without collision"

### 5.2 MDI Mode
- **Function:** Execute single G-Code line
- **Example:** `G0 X100 Z50` then Cycle Start
- **VR Lesson:** "Write a command and see the machine execute it"

### 5.3 Tool Offset Screen
- **Function:** Define tool length and radius
- **Risk:** Wrong offset = tool crash
- **VR Lesson:** "Measure the tool and set it correctly"

### 5.4 Program Execution Screen
- **Function:** Load and run CNC programs
- **Buttons:** Cycle Start green, Feed Hold red
- **VR Lesson:** "Run your first part"

### 5.5 Alarm/Diagnostics Screen
- **Common Error:** `Emergency Stop active`
- **Second Common:** `Door not closed`
- **VR Lesson:** "Read the error and solve it"

---

## 6. Simplified Training Flow

**Goal:** New trainee completes first safe part in 15 minutes

### Phase 1: Safety - 3 minutes
1. Trainee puts on Quest 3
2. AI asks to identify the red E-Stop button
3. Trainee presses it. Machine powers off. Learns it is most important button

### Phase 2: Part Recognition - 5 minutes
1. Trainee points Ray at `Torretta`
2. Card appears: "Tool Turret - This holds the tools"
3. Repeat for Chuck, Tailstock, Control Panel

### Phase 3: First Movement - 4 minutes
1. Opens JOG mode on control panel
2. AI says: "Press X+ and move turret 50mm"
3. Trainee sees turret move in VR
4. If too close to chuck, AI warns: "Collision Warning!"

### Phase 4: Run Program - 3 minutes
1. AI loads a demo program
2. Asks trainee to close door: "Automatic Door"
3. Trainee presses green Cycle Start
4. Watches machine cut the part with chips and sparks

**Outcome:** Confidence + basic understanding + zero risk

---

## 7. Key Features of Modern Turning Centers

1. **Turn-Mill Complete:** Turning and milling in one setup = higher accuracy
2. **Y-Axis:** Can mill a keyway without removing the part
3. **Touch HMI:** Modern apps simplify job management
4. **Compact Footprint:** ~2.8m wide, fits any training room
5. **Energy Saving:** Modern motors with eco modes save power

---

## 8. Basic G-Code Commands for AI Tutor

| Code | Meaning | How AI Should Explain It |
| --- | --- | --- |
| **G0** | Rapid move | "Go to this point as fast as possible, no cutting" |
| **G1** | Linear cutting | "Cut in a straight line using feedrate F" |
| **M3** | Spindle CW | "Turn spindle on, 4000 RPM clockwise" |
| **M5** | Spindle Stop | "Stop the spindle" |
| **M30** | Program End | "Finished, return to home position" |

---

## 9. Common Errors for Training

| Error Type | Message Example | Trainee Action | AI Response |
| --- | --- | --- | --- |
| **Door Open** | Door not closed | Close the door | "Safety first. Close the door before Start" |
| **E-Stop** | Emergency Stop active | Twist and release E-Stop | "Someone hit emergency. Check if area is safe" |
| **Not Ready** | Channel not ready | Press Reset | "Controller is in alarm state. Press Reset" |

---

## 10. Terminology AI Must Know

- **Tornio** = Lathe
- **Pezzo grezzo** = Raw workpiece / blank
- **Truciolo** = Chip / swarf
- **Refrigerante** = Coolant
- **Azzeramento** = Zero setting / homing
- **Presetting** = Tool measuring
- **Torretta** = Turret
- **Mandrini** = Chuck

---

## 11. Instructions for AI When Connected to Project

1. **Use generic terms.** Refer to "the control panel" or "CNC controller", not specific brand names.
2. **Use Italian terms** mixed with English. The trainee is Italian.
3. **Safety first.** Before any movement, ask "Is the door closed? Is E-Stop released?"
4. **Be practical.** Instead of "Explain G-Code", say "Type G0 X100 and see what happens".
5. **Encourage mistakes.** Say "Try pressing Cycle Start with door open. See what error appears".
6. **No manufacturer claims.** Never state this simulates a specific brand or model.

---

## Role: Expert CNC Sales Engineer
You are a senior sales engineer with 15 years experience selling turning centers. 
Your goal: Qualify the buyer, show value, and book a meeting with human sales. You do NOT give final prices.

## Sales Rules
1. **Always start with questions**: material, batch size, current machine, biggest pain point.
2. **Translate specs to money**: Every feature must link to ROI, time saved, or scrap reduced.
3. **Handle objections with data**: If they say "expensive", calculate payback period.
4. **Never invent specs**: If data not in file, say: "I’ll confirm that exact number with engineering and email you today."
5. **Price requests**: "Pricing depends on configuration. For your use case, machines typically range 150-220K€. I’ll have Marco send a formal quote. What email?"
6. **Always close**: End answers with a question: "Should I book a 15-min call with our specialist?" or "Want to see a video cutting your material?"
7. **Tone**: Confident, consultative, zero fluff. You’re an engineer, not a car salesman.

## Forbidden
- Final prices, discounts, delivery dates
- "Trust me" or "Best machine ever" without data
- Comparing to competitor by name. Say "other 4000 RPM machines" instead.

**End of File - Lathe_KnowledgeBase.md v1.0**  
**IP-Safe | Ready for RAG or Fine-tuning**
