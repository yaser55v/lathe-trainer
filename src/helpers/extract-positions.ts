/**
 * extract-positions.ts
 * ====================
 * Utility to extract actual 3D positions from the lathe GLB model.
 * Run this once to get accurate component positions, then update machine-map.ts
 */

import { AssetManager } from "@iwsdk/core";
import { Box3, Vector3 } from "three";
import { MACHINE_COMPONENTS } from "../machine/machine-map";

/**
 * Extract real world positions of all components from the loaded model.
 * Call this after the model is loaded and placed in the scene.
 */
export function extractComponentPositions(latheRoot: any): void {
  console.log("=== EXTRACTING COMPONENT POSITIONS ===");
  
  for (const component of MACHINE_COMPONENTS) {
    const meshes: any[] = [];
    
    // Find all meshes belonging to this component
    latheRoot.traverse((child: any) => {
      if (component.meshNames.includes(child.name)) {
        meshes.push(child);
      }
    });
    
    if (meshes.length === 0) {
      console.warn(`⚠️ No meshes found for component: ${component.id}`);
      continue;
    }
    
    // Calculate bounding box center (component position)
    const box = new Box3();
    for (const mesh of meshes) {
      box.expandByObject(mesh);
    }
    
    const center = new Vector3();
    box.getCenter(center);
    
    const size = new Vector3();
    box.getSize(size);
    
    // Suggest proximity radius based on bounding box size
    const maxDim = Math.max(size.x, size.y, size.z);
    const suggestedRadius = maxDim * 1.5; // 1.5x the largest dimension
    
    console.log(`✅ ${component.displayName} (${component.id}):`);
    console.log(`   Position: { x: ${center.x.toFixed(2)}, y: ${center.y.toFixed(2)}, z: ${center.z.toFixed(2)} }`);
    console.log(`   Size: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}m`);
    console.log(`   Suggested proximityRadius: ${suggestedRadius.toFixed(2)}`);
    console.log("");
  }
  
  console.log("=== COPY THESE VALUES TO machine-map.ts ===");
}

/**
 * Calculate machine center position (average of all component positions)
 */
export function calculateMachineCenter(latheRoot: any): Vector3 {
  const positions: Vector3[] = [];
  
  for (const component of MACHINE_COMPONENTS) {
    latheRoot.traverse((child: any) => {
      if (component.meshNames.includes(child.name)) {
        const pos = new Vector3();
        child.getWorldPosition(pos);
        positions.push(pos);
        return; // Found one, move to next component
      }
    });
  }
  
  if (positions.length === 0) {
    return new Vector3(0, 0, -3); // Fallback
  }
  
  const center = new Vector3();
  for (const pos of positions) {
    center.add(pos);
  }
  center.divideScalar(positions.length);
  
  console.log(`Machine Center: x=${center.x.toFixed(2)}, y=${center.y.toFixed(2)}, z=${center.z.toFixed(2)}`);
  
  return center;
}
