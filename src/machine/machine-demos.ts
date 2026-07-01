/**
 * machine-demos.ts
 * ================
 * Scripted demo sequences that combine highlights + narration.
 *
 * Each step has:
 *   - action: component id to highlight (or "clear")
 *   - message: text the assistant speaks / displays
 *   - delayMs: how long to hold this step before auto-advancing
 *
 * runDemo() is called by AssistantService when DEMO_HOW_IT_WORKS fires.
 * It drives the presenter and ExploreSystem directly via callbacks injected
 * from index.ts, keeping this file free of IWSDK imports.
 */

export interface DemoStep {
  /** machine component id to highlight, or "clear" to remove all */
  componentId: string | "clear";
  /** spoken / displayed text for this step */
  message: string;
  /** milliseconds to hold this step before advancing */
  delayMs: number;
}

// ─── Step builder helpers ─────────────────────────────────────────────────────

function s(componentId: string, message: string, delayMs: number): DemoStep {
  return { componentId, message, delayMs };
}

// ─── Multilingual Demo Scripts ────────────────────────────────────────────────

const DEMO_EN: DemoStep[] = [
  s("clear", "Let me walk you through the main components of this CNC turning center.", 3500),
  s("chip_conveyor", "Starting at the base — this is the Chip Conveyor. It runs continuously during machining, pulling swarf away from the cutting zone and carrying it to the collection bin at the back. Keeping chips clear protects the machine and the workpiece.", 7000),
  s("control_panel", "Moving to the front — the Control Panel is your main interface. It runs a Fanuc-style CNC controller with an MDI keyboard, a jog dial, and the main status display. Every programme, feed rate, and alarm is managed from here.", 7000),
  s("door", "Directly beside the panel is the Safety Door. During any cutting cycle it must be fully closed. The interlock engages automatically and prevents the spindle from running if the door is open — this is mandatory under ISO 13850.", 7000),
  s("clear", "Let me open the door so you can see inside.", 2500),
  s("chuck", "Inside you can see the Chuck — the spindle-mounted clamping device that grips and rotates the workpiece at speed. Jaw selection depends on part diameter and material. This is the starting point of every turning operation.", 7000),
  s("tailstock", "Opposite the chuck is the Tailstock. It slides along the bed to support long or slender workpieces from the far end, preventing flex and vibration during deep cuts. It also accepts a live centre or drill chuck for back-end operations.", 7000),
  s("tool_turret", "The Tool Turret is the cutting brain of the machine. It holds up to 12 tool positions and indexes to the next tool in under 0.2 seconds. Six of those positions can carry live rotary tools for milling and drilling without removing the workpiece.", 7000),
  s("clear", "That is the full tour. Ask me about any component and I will give you a deeper explanation.", 4000),
];

const DEMO_IT: DemoStep[] = [
  s("clear", "Lasciami guidarti attraverso i principali componenti di questo centro di tornitura CNC.", 3500),
  s("chip_conveyor", "Partiamo dalla base: questo e il Convogliatore di Trucioli. Funziona continuamente durante la lavorazione, raccogliendo i trucioli dalla zona di taglio e portandoli al contenitore sul retro della macchina.", 7000),
  s("control_panel", "Qui davanti troviamo il Pannello di Controllo, la tua interfaccia principale. Monta un controller CNC in stile Fanuc con tastiera MDI, manopola jog e il display di stato principale.", 7000),
  s("door", "Accanto al pannello c e la Porta di Sicurezza. Durante qualsiasi ciclo di taglio deve essere completamente chiusa. Il blocco interlock impedisce l avvio del mandrino con la porta aperta, come previsto dalla norma ISO 13850.", 7000),
  s("clear", "Apro la porta per mostrarti l interno.", 2500),
  s("chuck", "All interno vedi il Mandrino, il dispositivo di bloccaggio montato sul mandrino che afferra e ruota il pezzo in lavorazione ad alta velocita. E il punto di partenza di ogni operazione di tornitura.", 7000),
  s("tailstock", "Di fronte al mandrino c e la Contropunta. Scorre lungo le guide per supportare pezzi lunghi o snelli dall estremita opposta, prevenendo flessione e vibrazioni durante le passate profonde.", 7000),
  s("tool_turret", "La Torretta Portautensili e il cuore operativo della macchina. Ospita fino a 12 utensili e si indicizza al successivo in meno di 0.2 secondi. Sei posizioni supportano utensili rotanti per fresatura e foratura.", 7000),
  s("clear", "Questo e il tour completo. Chiedimi pure di qualsiasi componente per approfondire.", 4000),
];

const DEMO_AR: DemoStep[] = [
  s("clear", "دعني آخذك في جولة عبر المكونات الرئيسية لهذا مركز التخريط CNC.", 3500),
  s("chip_conveyor", "نبدأ من القاعدة: هذا هو ناقل الرقائق. يعمل باستمرار أثناء التشغيل، ينقل الرقائق المعدنية بعيداً عن منطقة القطع إلى صندوق التجميع في الخلف.", 7000),
  s("control_panel", "أمامنا لوحة التحكم، وهي واجهتك الرئيسية. تعمل بنظام CNC على غرار Fanuc مع لوحة مفاتيح MDI وعجلة التحريك البطيء وشاشة الحالة الرئيسية.", 7000),
  s("door", "بجانب اللوحة مباشرةً نجد باب الأمان. يجب إغلاقه تماماً أثناء أي دورة قطع. يمنع نظام القفل المدمج تشغيل المغزل عند فتح الباب، وذلك وفقاً للمعيار ISO 13850.", 7000),
  s("clear", "سأفتح الباب لأريك ما بداخله.", 2500),
  s("chuck", "داخل الماكينة ترى الفك، وهو جهاز التثبيت المركب على المغزل الذي يمسك قطعة العمل ويدورها بسرعة عالية. هو نقطة البداية لكل عملية تخريط.", 7000),
  s("tailstock", "في الطرف المقابل للفك يوجد المؤخرة. تنزلق على طول الفراش لتدعم قطع العمل الطويلة أو النحيفة من النهاية البعيدة، مما يمنع الانحناء والاهتزاز أثناء القطع العميق.", 7000),
  s("tool_turret", "برج الأدوات هو العقل التشغيلي للماكينة. يحمل ما يصل إلى 12 موضعاً للأدوات وينتقل إلى الأداة التالية في أقل من 0.2 ثانية. ستة مواضع تدعم أدوات دوارة للتفريز والحفر.", 7000),
  s("clear", "هذه هي الجولة الكاملة. اسألني عن أي مكوّن لشرح أعمق.", 4000),
];

const DEMO_FR: DemoStep[] = [
  s("clear", "Laissez-moi vous presenter les principaux composants de ce centre de tournage CNC.", 3500),
  s("chip_conveyor", "Commencons par la base: le Convoyeur de Copeaux. Il fonctionne en continu pendant l usinage, evacuant les copeaux de la zone de coupe vers le bac de collecte a l arriere.", 7000),
  s("control_panel", "A l avant se trouve le Pupitre de Commande, votre interface principale. Il integre un controleur CNC de type Fanuc avec clavier MDI, manette jog et ecran de statut principal.", 7000),
  s("door", "Juste a cote du pupitre se trouve le Portillon de Securite. Il doit etre completement ferme pendant tout cycle d usinage. Le verrouillage empeche le demarrage de la broche porte ouverte, conformement a la norme ISO 13850.", 7000),
  s("clear", "J ouvre le portillon pour vous montrer l interieur.", 2500),
  s("chuck", "A l interieur vous voyez le Mandrin, le dispositif de serrage monte sur la broche qui maintient et fait tourner la piece a grande vitesse. C est le point de depart de chaque operation de tournage.", 7000),
  s("tailstock", "En face du mandrin se trouve la Poupee Mobile. Elle glisse le long du banc pour soutenir les pieces longues ou freles a leur extremite, evitant la flexion et les vibrations lors des passes profondes.", 7000),
  s("tool_turret", "La Tourelle Porte-Outils est le coeur operationnel. Elle accueille jusqu a 12 outils et s indexe en moins de 0.2 seconde. Six positions supportent des outils rotatifs pour le fraisage et le percage.", 7000),
  s("clear", "Voila le tour complet. Posez-moi des questions sur n importe quel composant pour approfondir.", 4000),
];

const DEMO_ES: DemoStep[] = [
  s("clear", "Dejame guiarte por los principales componentes de este centro de torneado CNC.", 3500),
  s("chip_conveyor", "Empezamos por la base: el Transportador de Virutas. Funciona continuamente durante el mecanizado, llevando las virutas desde la zona de corte hasta el contenedor trasero.", 7000),
  s("control_panel", "Al frente encontramos el Panel de Control, tu interfaz principal. Utiliza un controlador CNC estilo Fanuc con teclado MDI, volante jog y pantalla de estado principal.", 7000),
  s("door", "Junto al panel esta la Puerta de Seguridad. Debe estar completamente cerrada durante cualquier ciclo de corte. El enclavamiento impide arrancar el husillo con la puerta abierta, segun la norma ISO 13850.", 7000),
  s("clear", "Abro la puerta para mostrarte el interior.", 2500),
  s("chuck", "Dentro puedes ver el Plato de Garras, el dispositivo de sujecion montado en el husillo que agarra y hace girar la pieza a alta velocidad. Es el punto de partida de cada operacion de torneado.", 7000),
  s("tailstock", "Frente al plato esta el Contrapunto. Se desliza por el bancal para sujetar piezas largas o esbeltas desde el extremo opuesto, evitando flexion y vibraciones en pasadas profundas.", 7000),
  s("tool_turret", "La Torreta Portaherramientas es el cerebro operativo. Alberga hasta 12 herramientas e indexa en menos de 0.2 segundos. Seis posiciones admiten herramientas giratorias para fresado y taladrado.", 7000),
  s("clear", "Ese es el recorrido completo. Preguntame sobre cualquier componente para profundizar.", 4000),
];

/** Kept for backward compatibility — defaults to English */
export const HOW_IT_WORKS_DEMO: DemoStep[] = DEMO_EN;

/** Select the correct demo script by language code */
export function getDemoForLanguage(lang: string): DemoStep[] {
  switch (lang) {
    case "it": return DEMO_IT;
    case "ar": return DEMO_AR;
    case "fr": return DEMO_FR;
    case "es": return DEMO_ES;
    default: return DEMO_EN;
  }
}


export interface DemoCallbacks {
  highlight: (id: string) => void;
  clearHighlights: () => void;
  showMessage: (text: string, onSpoken?: () => void) => void;
  onDemoEnd?: () => void;
  /** Optional: called mid-demo to physically open the machine door */
  openDoor?: () => void;
}

/**
 * Runs a demo script step-by-step.
 * Each step WAITS for TTS to finish before advancing to next step.
 * Returns a cancel function.
 */
export function runDemo(
  steps: DemoStep[],
  callbacks: DemoCallbacks,
): () => void {
  let cancelled = false;
  let currentStepTimer: ReturnType<typeof setTimeout> | null = null;

  function runStep(index: number): void {
    if (cancelled || index >= steps.length) {
      callbacks.onDemoEnd?.();
      return;
    }

    const step = steps[index];

    // Apply highlight
    if (step.componentId === "clear") {
      callbacks.clearHighlights();
    } else {
      callbacks.highlight(step.componentId);
    }

    let speechCompleted = false;
    let minDelayCompleted = false;

    // Advance only when BOTH speech finished AND minimum delay passed
    const tryAdvance = () => {
      if (cancelled) return;
      if (speechCompleted && minDelayCompleted) {
        // Small gap between steps so transitions are smooth
        currentStepTimer = setTimeout(() => runStep(index + 1), 400);
      }
    };

    // Start minimum delay timer
    currentStepTimer = setTimeout(() => {
      minDelayCompleted = true;
      tryAdvance();
    }, step.delayMs);

    // Start TTS - wait for completion
    callbacks.showMessage(step.message, () => {
      speechCompleted = true;
      tryAdvance();
    });
  }

  runStep(0);

  return () => {
    cancelled = true;
    if (currentStepTimer !== null) clearTimeout(currentStepTimer);
    callbacks.clearHighlights();
  };
}
