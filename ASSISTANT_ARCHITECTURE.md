# Assistant Decision Architecture

## Overview

The assistant system has been redesigned with a dedicated **PromptBuilder** that enforces strict architectural principles:

1. **Clear section ordering** (8 fixed sections)
2. **Single source of truth** for each information type
3. **Separation of concerns** between static rules and runtime state
4. **Proper conversation history handling** via messages array

---

## Prompt Structure

The final prompt is always built in this exact order:

### 1. ROLE
- Defines the assistant's identity as an XR Digital Twin instructor
- Establishes scope: CNC machine training only

### 2. BEHAVIOR RULES
- Reject non-machine-related requests
- Internal reasoning: classify into EXPLAIN | HIGHLIGHT | ACTION | DEMO
- Response mode decision rules:
  - EXPLAIN: provide information
  - HIGHLIGHT/ACTION: emit token first, then explain
  - DEMO: emit token and STOP

### 3. LANGUAGE RULES
- Detect language from user's last message
- Respond in same language (English, Italian, Arabic)
- Keep technical terms in English when untranslatable

### 4. MACHINE KNOWLEDGE
- **Source of Truth**: Knowledge base from `CNC_System_Instructions.md`
- Machine facts, safety rules, operation procedures
- Authoritative for technical information

### 5. MACHINE COMPONENT MAP
- **Source of Truth**: `MACHINE_COMPONENTS` array
- Component names, IDs, descriptions
- Authoritative for component information

### 6. AVAILABLE ACTIONS
- **Source of Truth**: Action registry
- Door operations (open/close) with current state
- Component highlights with action tokens
- Demo triggers

### 7. DEMO RULES
- Automated tour action: `[ACTION:DEMO_HOW_IT_WORKS]`
- Demo mode: emit token and STOP (no explanation)

### 8. LIVE SCENE CONTEXT
- **Source of Truth**: Runtime state from ECS systems
- User position (updated every frame)
- Currently highlighted component
- Machine state (door, spindle, mode)
- Authoritative for current runtime state

---

## Conversation History

**CRITICAL**: History is **NOT** in the system prompt.

It's handled via the OpenAI messages array structure:

```typescript
{
  messages: [
    { role: "system", content: "...sections 1-8..." },
    { role: "user", content: "How does the spindle work?" },
    { role: "assistant", content: "The spindle rotates..." },
    { role: "user", content: "What about the turret?" },
    // ...
  ]
}
```

This allows the LLM to:
- Track conversation properly
- Use reasoning capabilities effectively
- Keep system prompt stable and focused

---

## Single Source of Truth

Every piece of information has ONE authoritative source:

| Information Type | Source | Updated By |
|-----------------|--------|------------|
| Machine facts | Knowledge Base | Static (loaded once) |
| Component map | `MACHINE_COMPONENTS` | Static (hardcoded) |
| Available actions | Action Registry | Static (registered at boot) |
| Runtime state | Scene Context | ECS systems (every frame) |
| Conversation | Messages array | AssistantService (each turn) |

**Rule**: History can provide context but must NEVER override facts from Knowledge Base or Component Map.

---

## File Structure

```
src/services/
├── prompt-builder.ts       # NEW: Dedicated prompt assembly
├── assistant-context.ts    # Context manager (uses PromptBuilder)
├── assistant-service.ts    # API streaming, events, history
├── scene-context.ts        # Live runtime state interface
└── action-registry.ts      # Action token → function mapping

src/systems/
└── assistant-system.ts     # ECS bridge (updates scene context)

src/index.ts                # Wires everything at boot
```

---

## Internal Reasoning Flow

Before generating any response, the assistant:

1. **Classify intent** into ONE primary mode:
   - EXPLAIN: user wants information
   - HIGHLIGHT: user asks "what is this?"
   - ACTION: user requests operation
   - DEMO: user wants automated tour

2. **Execute mode**:
   - HIGHLIGHT/ACTION: emit `[ACTION:*]` token first, then explain
   - DEMO: emit `[ACTION:DEMO_HOW_IT_WORKS]` and STOP
   - EXPLAIN: respond with information only

3. **Language**: Always respond in user's language

4. **Scope check**: Reject if unrelated to machine/training

---

## Benefits

✅ **Clear separation**: Each section has one purpose  
✅ **Maintainable**: Add new knowledge without touching other sections  
✅ **Scalable**: History doesn't pollute system prompt  
✅ **Correct**: LLM receives structured conversation context  
✅ **Debuggable**: Each section can be inspected independently  

---

## Future Extensions

To add new capabilities:

1. **New component**: Add to `MACHINE_COMPONENTS` → auto-available
2. **New action**: Register in `ActionRegistry` → appears in section 6
3. **New runtime state**: Add to `SceneContext` → appears in section 8
4. **New knowledge**: Update `.md` file → appears in section 4

No cross-contamination. No prompt editing required.
