/**
 * spatial-analyzer.ts
 * ===================
 * Mathematical spatial awareness - no screenshots needed.
 *
 * Calculates geometric relationships between user position and machine components:
 * - Which component is closest
 * - Which component user is facing
 * - Distance and direction to each component
 * - Spatial context for AI reasoning
 */

import { MACHINE_COMPONENTS } from "../machine/machine-map";
import type { MachineComponent } from "../machine/machine-map";
import type { UserPosition } from "./scene-context";
import {
  MACHINE_CENTER,
  BEHIND_MACHINE_Z_OFFSET,
  BACK_PANEL_Z_THRESHOLD,
  FRONT_COMPONENT_Z,
  BACK_COMPONENT_Z,
  RIGHT_SIDE_X_OFFSET,
} from "../machine/machine-geometry";

export interface SpatialAnalysis {
  /** Component user is closest to */
  nearestComponent: MachineComponent | null;
  /** Distance to nearest component in meters */
  nearestDistance: number;
  /** Component user is likely facing (based on forward vector) */
  facingComponent: MachineComponent | null;
  /** All components within interaction range (sorted by distance) */
  nearbyComponents: Array<{ component: MachineComponent; distance: number }>;
  /** Human-readable spatial description */
  description: string;
  /** Relative position to machine (front/back/left/right) */
  relativePosition: string;
  /** Directionally-relevant component (used for context selection) */
  relevantComponent: MachineComponent | null;
  /** Distance to relevant component */
  relevantDistance: number;
}

/**
 * Analyze user's spatial relationship to all machine components
 */
export function analyzeSpatialContext(
  userPos: UserPosition,
  userForward?: { x: number; y: number; z: number }
): SpatialAnalysis {
  // Calculate distance to each component
  const distances = MACHINE_COMPONENTS.map((component) => ({
    component,
    distance: calculateDistance(userPos, component.position),
  }));

  // Sort by distance
  distances.sort((a, b) => a.distance - b.distance);

  const nearest = distances[0];
  const nearbyComponents = distances.filter(
    (d) => d.distance <= d.component.proximityRadius * 2
  );

  // Determine which component user is facing
  let facingComponent: MachineComponent | null = null;
  if (userForward) {
    facingComponent = findFacingComponent(userPos, userForward, distances);
  }

  // Build spatial description and get directionally-relevant component
  const relativePosition = getRelativePosition(userPos, MACHINE_CENTER);
  const { description, relevantComponent, relevantDistance } = buildSpatialDescription(
    userPos,
    nearest,
    relativePosition,
    facingComponent
  );

  return {
    nearestComponent: nearest.component,
    nearestDistance: nearest.distance,
    facingComponent,
    nearbyComponents,
    description,
    relativePosition,
    relevantComponent,
    relevantDistance,
  };
}

/**
 * Calculate 3D Euclidean distance between two points
 */
function calculateDistance(
  pos1: { x: number; y: number; z: number },
  pos2: { x: number; y: number; z: number }
): number {
  const dx = pos1.x - pos2.x;
  const dy = pos1.y - pos2.y;
  const dz = pos1.z - pos2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Determine which component user is facing based on forward vector
 */
function findFacingComponent(
  userPos: UserPosition,
  forward: { x: number; y: number; z: number },
  distances: Array<{ component: MachineComponent; distance: number }>
): MachineComponent | null {
  let bestMatch: MachineComponent | null = null;
  let bestDot = -1;

  for (const { component, distance } of distances) {
    // Only consider components within reasonable range
    if (distance > 5.0) continue;

    // Calculate direction vector from user to component
    const toComponent = {
      x: component.position.x - userPos.x,
      y: component.position.y - userPos.y,
      z: component.position.z - userPos.z,
    };

    // Normalize
    const mag = Math.sqrt(
      toComponent.x ** 2 + toComponent.y ** 2 + toComponent.z ** 2
    );
    if (mag === 0) continue;

    toComponent.x /= mag;
    toComponent.y /= mag;
    toComponent.z /= mag;

    // Dot product = how aligned forward vector is with component direction
    const dot =
      forward.x * toComponent.x +
      forward.y * toComponent.y +
      forward.z * toComponent.z;

    // User must be facing generally toward component (dot > 0.5 = within ~60°)
    if (dot > 0.5 && dot > bestDot) {
      bestDot = dot;
      bestMatch = component;
    }
  }

  return bestMatch;
}

/**
 * Get user's position relative to machine center (front/back/left/right)
 */
function getRelativePosition(
  userPos: UserPosition,
  machineCenter: { x: number; y: number; z: number }
): string {
  const dx = userPos.x - machineCenter.x;
  const dz = userPos.z - machineCenter.z;
  const distance = Math.sqrt(dx * dx + dz * dz);

  let direction = "";
  if (Math.abs(dz) > Math.abs(dx)) {
    direction = dz > 0 ? "in front of" : "behind";
  } else {
    direction = dx > 0 ? "to the right of" : "to the left of";
  }

  let height = "";
  const dy = userPos.y;
  if (dy < 0.5) height = "below";
  else if (dy > 2.0) height = "above";
  else height = "at operator level with";

  return `${direction} the machine (${distance.toFixed(1)}m away), ${height}`;
}

/**
 * Build human-readable spatial description for AI
 */
function buildSpatialDescription(
  userPos: UserPosition,
  nearest: { component: MachineComponent; distance: number },
  relativePosition: string,
  facingComponent: MachineComponent | null
): { description: string; relevantComponent: MachineComponent; relevantDistance: number } {
  const parts: string[] = [];

  parts.push(`User is ${relativePosition}`);

  // Determine user's primary direction relative to machine
  const dx = userPos.x - MACHINE_CENTER.x;
  const dz = userPos.z - MACHINE_CENTER.z;

  const isBehind = dz > BACK_PANEL_Z_THRESHOLD;
  const isInFront = dz < -BACK_PANEL_Z_THRESHOLD;
  const isRight = dx > RIGHT_SIDE_X_OFFSET;

  // Find directionally appropriate component
  let relevantComponent = nearest.component;
  let relevantDistance = nearest.distance;

  if (isBehind) {
    // User in front looking at back - prioritize door/visible back components
    // Door is the "front" of the machine that users see
    const frontComponents = MACHINE_COMPONENTS.filter(c =>
      c.id === 'door' || c.id === 'control_panel' || c.position.z > FRONT_COMPONENT_Z
    ).map(c => ({
      component: c,
      distance: calculateDistance(userPos, c.position)
    })).sort((a, b) => a.distance - b.distance);

    if (frontComponents.length > 0) {
      relevantComponent = frontComponents[0].component;
      relevantDistance = frontComponents[0].distance;
    }
  } else if (isInFront) {
    // User behind machine looking at true back - prioritize back components
    // When user Z < -4.0, they're viewing the actual back panel/vents
    const isViewingBackPanel = userPos.z < MACHINE_CENTER.z - BACK_PANEL_Z_THRESHOLD;

    if (isViewingBackPanel) {
      // User is behind machine viewing back panel
      // Find components on the back side (most negative Z)
      const backComponents = MACHINE_COMPONENTS.filter(c =>
        c.position.z < BACK_COMPONENT_Z
      ).map(c => ({
        component: c,
        distance: calculateDistance(userPos, c.position)
      })).sort((a, b) => a.distance - b.distance);

      if (backComponents.length > 0) {
        relevantComponent = backComponents[0].component;
        relevantDistance = backComponents[0].distance;
      }
    } else {
      const backComponents = MACHINE_COMPONENTS.filter(c =>
        c.position.z < BACK_COMPONENT_Z
      ).map(c => ({
        component: c,
        distance: calculateDistance(userPos, c.position)
      })).sort((a, b) => a.distance - b.distance);

      if (backComponents.length > 0) {
        relevantComponent = backComponents[0].component;
        relevantDistance = backComponents[0].distance;
      }
    }
  } else if (isRight) {
    // User on right side - prioritize right components
    const rightComponents = MACHINE_COMPONENTS.filter(c =>
      c.position.x > MACHINE_CENTER.x + RIGHT_SIDE_X_OFFSET
    ).map(c => ({
      component: c,
      distance: calculateDistance(userPos, c.position)
    })).sort((a, b) => a.distance - b.distance);

    if (rightComponents.length > 0) {
      relevantComponent = rightComponents[0].component;
      relevantDistance = rightComponents[0].distance;
    }
  }


  if (relevantDistance < relevantComponent.proximityRadius) {
    const isViewingBack = userPos.z < MACHINE_CENTER.z - BACK_PANEL_Z_THRESHOLD;
    const backNote = isViewingBack ? " (viewing machine back panel)" : "";
    parts.push(
      `Standing very close to the ${relevantComponent.displayName} (${relevantDistance.toFixed(1)}m)${backNote}`
    );
  } else if (relevantDistance < relevantComponent.proximityRadius * 2) {
    const isViewingBack = userPos.z < MACHINE_CENTER.z - BACK_PANEL_Z_THRESHOLD;
    const backNote = isViewingBack ? " (behind the machine)" : "";
    parts.push(
      `Near the ${relevantComponent.displayName} (${relevantDistance.toFixed(1)}m)${backNote}`
    );
  } else {
    parts.push(
      `Closest component: ${relevantComponent.displayName} (${relevantDistance.toFixed(1)}m away)`
    );
  }

  if (facingComponent && facingComponent.id !== relevantComponent.id) {
    parts.push(`Facing the ${facingComponent.displayName}`);
  }

  return {
    description: parts.join(". "),
    relevantComponent,
    relevantDistance
  };
}

/**
 * Find component by ID (helper for manual queries)
 */
export function getComponentById(id: string): MachineComponent | null {
  return MACHINE_COMPONENTS.find((c) => c.id === id) || null;
}

/**
 * Check if user is in an unusual/unsafe position
 */
export function isUnusualPosition(userPos: UserPosition): boolean {
  // Behind machine
  if (userPos.z < MACHINE_CENTER.z - BEHIND_MACHINE_Z_OFFSET) return true;

  // Too close to moving parts (chuck/turret)
  const chuck = MACHINE_COMPONENTS.find((c) => c.id === "chuck");
  const turret = MACHINE_COMPONENTS.find((c) => c.id === "tool_turret");

  if (chuck) {
    const distToChuck = calculateDistance(userPos, chuck.position);
    if (distToChuck < 0.5) return true; // Dangerously close
  }

  if (turret) {
    const distToTurret = calculateDistance(userPos, turret.position);
    if (distToTurret < 0.5) return true;
  }

  return false;
}
