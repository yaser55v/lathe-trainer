import {
  createSystem,
  World,
  AssetManager,
  PanelUI,
  PanelDocument,
  Interactable,
  Hovered,
  Vector3,
  Quaternion,
  Mesh,
  MeshStandardMaterial,
  Color,
  FrontSide,
  Object3D,
  Box3,
  Matrix4,
  Euler,
} from "@iwsdk/core";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";

export class SpatialUIIconSystem extends createSystem({
  uiPanel: {
    required: [PanelUI, PanelDocument],
    where: [(PanelUI, "config", "./ui/lathe-parts-panel.uikitml")],
  },
  hoveredTiles: {
    required: [Interactable, Hovered],
  },
}) {
  private iconMeshes: Map<string, Mesh> = new Map();
  private tileToIconMap: Map<number, Mesh> = new Map();
  private initialScales: Map<string, Vector3> = new Map();
  private targetScales: Map<string, Vector3> = new Map();
  private scratchVector3_1: Vector3;
  private scratchVector3_2: Vector3;
  private scratchQuaternion: Quaternion;
  private scratchMatrix4: Matrix4;
  private scratchEuler: Euler;
  private currentHoveredTileEntityIndex: number | null = null;

  init() {
    this.scratchVector3_1 = new Vector3();
    this.scratchVector3_2 = new Vector3();
    this.scratchQuaternion = new Quaternion();
    this.scratchMatrix4 = new Matrix4();
    this.scratchEuler = new Euler();

    this.queries.uiPanel.subscribe("qualify", (panelEntity) => {
      this.setup3DIcons(panelEntity);
    });

    this.queries.uiPanel.subscribe("disqualify", (panelEntity) => {
      this.cleanup3DIcons(panelEntity);
    });
  }

  async setup3DIcons(panelEntity: number) {
    const panelObject3D = this.world.getEntityObject3D(panelEntity);
    if (!panelObject3D) return;

    const gltf = AssetManager.getGLTF("icons") as GLTF;
    if (!gltf) {
      console.error("icons.glb not loaded!");
      return;
    }

    const meshNames = ["chunk.001", "tailstock.001", "tool_turret_desk.001"];
    const tileIds = ["tile-chuck", "tile-tailstock", "tile-tool-turret"];

    for (const name of meshNames) {
      const sourceMesh = gltf.scene.getObjectByName(name) as Mesh;
      if (sourceMesh) {
        const preparedMesh = this.prepare3DIconMesh(sourceMesh);
        this.iconMeshes.set(name, preparedMesh);
        this.initialScales.set(name, preparedMesh.scale.clone());
        this.targetScales.set(name, preparedMesh.scale.clone().multiplyScalar(1.2));
      } else {
        console.warn(`Mesh ${name} not found in icons.glb`);
      }
    }

    const panelDocument = PanelDocument.data.document[panelEntity];
    if (!panelDocument) return;

    for (let i = 0; i < tileIds.length; i++) {
      const tileId = tileIds[i];
      const meshName = meshNames[i];
      const iconMesh = this.iconMeshes.get(meshName);

      if (!iconMesh) continue;

      const tileObject3D = panelDocument.getElementById(tileId);
      if (tileObject3D) {
        tileObject3D.getWorldPosition(this.scratchVector3_1);

        panelObject3D.add(iconMesh);

        panelObject3D.worldToLocal(this.scratchVector3_1);

        iconMesh.position.copy(this.scratchVector3_1);
        iconMesh.position.z += 0.005;

        const tileEntity = this.world.getEntityByObject3D(tileObject3D);
        if (tileEntity !== undefined) {
          this.tileToIconMap.set(tileEntity, iconMesh);
        }
      } else {
        console.warn(`UI element with ID ${tileId} not found in panel.`);
      }
    }
  }

  prepare3DIconMesh(sourceMesh: Mesh): Mesh {
    const mesh = sourceMesh.clone();
    mesh.name = sourceMesh.name;

    mesh.scale.setScalar(0.005);

    mesh.geometry.computeBoundingBox();
    if (mesh.geometry.boundingBox) {
      mesh.geometry.boundingBox.getCenter(this.scratchVector3_1);
      mesh.geometry.translate(-this.scratchVector3_1.x, -this.scratchVector3_1.y, -this.scratchVector3_1.z);
    }

    mesh.material = new MeshStandardMaterial({
      color: new Color(0xaaaaaa),
      metalness: 0.9,
      roughness: 0.2,
      side: FrontSide,
    });

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  cleanup3DIcons(panelEntity: number) {
    const panelObject3D = this.world.getEntityObject3D(panelEntity);
    if (!panelObject3D) return;

    this.iconMeshes.forEach((mesh) => {
      panelObject3D.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    });
    this.iconMeshes.clear();
    this.tileToIconMap.clear();
    this.initialScales.clear();
    this.targetScales.clear();
  }

  update(delta: number) {
    this.iconMeshes.forEach((mesh) => {
      mesh.rotation.y += 0.005;
    });

    let newHoveredTileEntityIndex: number | null = null;
    for (const entity of this.queries.hoveredTiles.entities) {
      if (this.tileToIconMap.has(entity)) {
        newHoveredTileEntityIndex = entity;
        break;
      }
    }

    if (newHoveredTileEntityIndex !== this.currentHoveredTileEntityIndex) {
      if (this.currentHoveredTileEntityIndex !== null) {
        const prevIconMesh = this.tileToIconMap.get(this.currentHoveredTileEntityIndex);
        if (prevIconMesh) {
          const initialScale = this.initialScales.get(prevIconMesh.name);
          if (initialScale) prevIconMesh.scale.lerp(initialScale, 0.1);
        }
      }

      if (newHoveredTileEntityIndex !== null) {
        const newIconMesh = this.tileToIconMap.get(newHoveredTileEntityIndex);
        if (newIconMesh) {
          const targetScale = this.targetScales.get(newIconMesh.name);
          if (targetScale) newIconMesh.scale.lerp(targetScale, 0.1);
        }
      }
      this.currentHoveredTileEntityIndex = newHoveredTileEntityIndex;
    } else if (this.currentHoveredTileEntityIndex !== null) {
      const currentIconMesh = this.tileToIconMap.get(this.currentHoveredTileEntityIndex);
      if (currentIconMesh) {
        const targetScale = this.targetScales.get(currentIconMesh.name);
        if (targetScale) currentIconMesh.scale.lerp(targetScale, 0.1);
      }
    }

    this.iconMeshes.forEach((mesh) => {
      if (this.currentHoveredTileEntityIndex === null || this.tileToIconMap.get(this.currentHoveredTileEntityIndex) !== mesh) {
        const initialScale = this.initialScales.get(mesh.name);
        if (initialScale) mesh.scale.lerp(initialScale, 0.1);
      }
    });
  }
}