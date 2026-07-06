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
  s("chip_conveyor", "This is the Chip Conveyor. It runs continuously during machining, pulling metal swarf away from the cutting zone to the collection bin at the back.", 5500),
  s("control_panel", "This is the Control Panel — your main interface. Fanuc-style CNC controller with an MDI keyboard, jog dial, and status display.", 5500),
  s("door", "The Safety Door must be fully closed during any cutting cycle. The interlock prevents the spindle from running if it is open — ISO 13850 standard.", 5500),
  s("clear", "Let me open the door so you can see inside.", 2500),
  s("chuck", "This is the Chuck. It grips and rotates the workpiece at speed — up to 4,000 RPM, with a maximum bar capacity of 65 mm.", 5500),
  s("tailstock", "The Tailstock supports long or slender workpieces from the far end, preventing flex and vibration during deep cuts.", 5000),
  s("tool_turret", "The Tool Turret holds up to 12 tools and indexes to the next one in under 0.2 seconds. Six positions support live rotary tools for milling and drilling.", 5500),
  s("clear", "That is the full tour. Ask me about any component for a deeper explanation.", 3500),
];

const DEMO_IT: DemoStep[] = [
  s("clear", "Ti mostro i componenti principali di questo centro di tornitura CNC.", 3500),
  s("chip_conveyor", "Questo è il Convogliatore di Trucioli. Funziona continuamente durante la lavorazione, portando i trucioli lontano dalla zona di taglio al contenitore sul retro.", 5500),
  s("control_panel", "Il Pannello di Controllo è la tua interfaccia principale. Controller CNC stile Fanuc con tastiera MDI, manopola jog e display di stato.", 5500),
  s("door", "La Porta di Sicurezza deve essere completamente chiusa durante ogni ciclo di taglio. Il blocco interlock impedisce l'avvio del mandrino con la porta aperta — norma ISO 13850.", 5500),
  s("clear", "Apro la porta per mostrarti l'interno.", 2500),
  s("chuck", "Il Mandrino afferra e fa ruotare il pezzo in lavorazione — fino a 4.000 giri/min, con capacità massima di 65 mm di diametro.", 5500),
  s("tailstock", "La Contropunta supporta pezzi lunghi o snelli dall'estremità opposta, prevenendo flessione e vibrazioni durante le passate profonde.", 5000),
  s("tool_turret", "La Torretta Portautensili ospita fino a 12 utensili e si indicizza in meno di 0.2 secondi. Sei posizioni supportano utensili rotanti per fresatura e foratura.", 5500),
  s("clear", "Questo è il tour completo. Chiedimi di qualsiasi componente per approfondire.", 3500),
];

const DEMO_AR: DemoStep[] = [
  s("clear", "دعني أريك المكونات الرئيسية لهذا مركز التخريط CNC.", 3500),
  s("chip_conveyor", "هذا هو ناقل الرقائق. يعمل باستمرار أثناء التشغيل لنقل الرقائق المعدنية بعيداً عن منطقة القطع إلى صندوق التجميع.", 5500),
  s("control_panel", "لوحة التحكم هي واجهتك الرئيسية — نظام CNC على غرار Fanuc مع لوحة مفاتيح MDI وعجلة التحريك وشاشة الحالة.", 5500),
  s("door", "باب الأمان يجب أن يكون مغلقاً تماماً أثناء أي دورة قطع. نظام القفل يمنع تشغيل المغزل مع فتح الباب — وفق معيار ISO 13850.", 5500),
  s("clear", "سأفتح الباب لأريك ما بالداخل.", 2500),
  s("chuck", "الفك يمسك قطعة العمل ويدورها — حتى 4000 دورة في الدقيقة، بسعة قضيب تصل إلى 65 ملم.", 5500),
  s("tailstock", "المؤخرة تدعم قطع العمل الطويلة من الطرف البعيد، لمنع الانحناء والاهتزاز أثناء القطع العميق.", 5000),
  s("tool_turret", "برج الأدوات يحمل حتى 12 أداة وينتقل بينها في أقل من 0.2 ثانية. ستة مواضع تدعم أدوات دوارة للتفريز والحفر.", 5500),
  s("clear", "هذه هي الجولة الكاملة. اسألني عن أي مكوّن لمزيد من التفاصيل.", 3500),
];

const DEMO_FR: DemoStep[] = [
  s("clear", "Voici les principaux composants de ce centre de tournage CNC.", 3500),
  s("chip_conveyor", "Le Convoyeur de Copeaux fonctionne en continu pendant l'usinage, évacuant les copeaux de la zone de coupe vers le bac de collecte à l'arrière.", 5500),
  s("control_panel", "Le Pupitre de Commande est votre interface principale — contrôleur CNC type Fanuc avec clavier MDI, manette jog et écran de statut.", 5500),
  s("door", "Le Portillon de Sécurité doit être totalement fermé pendant tout cycle d'usinage. Le verrouillage empêche le démarrage de la broche porte ouverte — norme ISO 13850.", 5500),
  s("clear", "J'ouvre le portillon pour vous montrer l'intérieur.", 2500),
  s("chuck", "Le Mandrin serre et fait tourner la pièce — jusqu'à 4 000 tr/min, avec une capacité barre maximale de 65 mm de diamètre.", 5500),
  s("tailstock", "La Poupée Mobile supporte les pièces longues ou frêles depuis leur extrémité, évitant la flexion et les vibrations lors des passes profondes.", 5000),
  s("tool_turret", "La Tourelle Porte-Outils accepte jusqu'à 12 outils et s'indexe en moins de 0.2 seconde. Six positions supportent des outils rotatifs pour le fraisage et le perçage.", 5500),
  s("clear", "Voilà le tour complet. Posez-moi des questions sur n'importe quel composant pour approfondir.", 3500),
];

const DEMO_ES: DemoStep[] = [
  s("clear", "Te muestro los componentes principales de este centro de torneado CNC.", 3500),
  s("chip_conveyor", "El Transportador de Virutas funciona continuamente durante el mecanizado, llevando las virutas desde la zona de corte hasta el contenedor trasero.", 5500),
  s("control_panel", "El Panel de Control es tu interfaz principal — controlador CNC estilo Fanuc con teclado MDI, volante jog y pantalla de estado.", 5500),
  s("door", "La Puerta de Seguridad debe estar completamente cerrada durante cualquier ciclo de corte. El enclavamiento impide arrancar el husillo con la puerta abierta — norma ISO 13850.", 5500),
  s("clear", "Abro la puerta para mostrarte el interior.", 2500),
  s("chuck", "El Plato de Garras agarra y hace girar la pieza — hasta 4.000 RPM, con capacidad de barra máxima de 65 mm de diámetro.", 5500),
  s("tailstock", "El Contrapunto soporta piezas largas o esbeltas desde el extremo opuesto, evitando flexión y vibraciones en pasadas profundas.", 5000),
  s("tool_turret", "La Torreta Portaherramientas alberga hasta 12 herramientas e indexa en menos de 0.2 segundos. Seis posiciones admiten herramientas giratorias para fresado y taladrado.", 5500),
  s("clear", "Ese es el recorrido completo. Pregúntame sobre cualquier componente para profundizar.", 3500),
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
