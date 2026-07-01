import {
  PanelDocument,
  Object3D,
  PanelUI,
  createSystem,
  eq,
} from "@iwsdk/core";
import type { UIKitDocument } from "@iwsdk/core";

interface NavItem {
  btnId: string;
  chipId: string;
  iconId: string;
  labelId: string;
}

const NAV_ITEMS: NavItem[] = [
  { btnId: "vn-explore", chipId: "vn-explore-chip", iconId: "vn-explore-icon", labelId: "vn-explore-label" },
  { btnId: "vn-panorama", chipId: "vn-panorama-chip", iconId: "vn-panorama-icon", labelId: "vn-panorama-label" },
  { btnId: "vn-ask-ai", chipId: "vn-ask-ai-chip", iconId: "vn-ask-ai-icon", labelId: "vn-ask-ai-label" },
];

const ACTIVE_CHIP = { backgroundColor: "#ffffff", backgroundOpacity: 0.92 };
const ACTIVE_ICON = { color: "#272727", opacity: 1 };
const ACTIVE_LABEL = { color: "#272727", opacity: 1, fontWeight: "700" as any };
const INACTIVE_CHIP = { backgroundColor: undefined, backgroundOpacity: 0 };
const INACTIVE_ICON = { color: "#ffffff", opacity: 0.9 };
const INACTIVE_LABEL = { color: "#ffffff", opacity: 0.9, fontWeight: "500" as any };

export class VerticalMenuSystem extends createSystem({
  verticalMenu: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/vertical-menu.json")],
  },
}) {
  private activeIndex = -1;
  private menuDoc: UIKitDocument | null = null;
  private menuWired = false;

  init() {
    this.queries.verticalMenu.subscribe("qualify", (entity) => {
      this.tryWireMenu();
    });
  }

  update() {
    if (!this.menuWired) this.tryWireMenu();
  }

  private tryWireMenu() {
    for (const entity of this.queries.verticalMenu.entities) {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument | undefined;
      if (!doc) continue;

      this.menuDoc = doc;
      this.wireMenu(doc);
      this.setActive(-1); // Start with no active tab
      this.menuWired = true;
      break;
    }
  }

  private wireMenu(doc: UIKitDocument) {
    NAV_ITEMS.forEach((_, index) => {
      const btn = doc.getElementById(NAV_ITEMS[index].btnId);
      if (!btn) {
        console.warn(`[VerticalMenuSystem] Button not found: ${NAV_ITEMS[index].btnId}`);
        return;
      }
      btn.addEventListener("click", () => {
        this.setActive(index);
      });
    });
  }

  private setActive(index: number) {
    this.activeIndex = index;
    const doc = this.menuDoc;
    if (!doc) return;

    // Update Tab UI
    NAV_ITEMS.forEach((item, i) => {
      const active = i === index;
      doc.getElementById(item.chipId)?.setProperties(active ? ACTIVE_CHIP : INACTIVE_CHIP);
      doc.getElementById(item.iconId)?.setProperties(active ? ACTIVE_ICON : INACTIVE_ICON);
      doc.getElementById(item.labelId)?.setProperties(active ? ACTIVE_LABEL : INACTIVE_LABEL);
    });

    // Update Explore System Visibility Signal
    const es = (this.world.globals as any).exploreSystem;
    if (es) {
      es.panelVisible.value = (index === 0);
    }

    // Update AI Card Visibility
    const aiCardObj = (this.world.globals as any).vmAiCardObject3D as Object3D | undefined;
    if (aiCardObj) {
      aiCardObj.visible = (index === 2);
    }
  }
}
