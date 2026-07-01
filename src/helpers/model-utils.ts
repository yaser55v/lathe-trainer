import { Object3D, Box3, Vector3 } from "@iwsdk/core";

/**
 * Optimizes materials on the loaded model on-the-fly.
 * - Programmatically inverts the glossiness map to a roughness map on the shader level.
 * - Sets realistic metallic factors for lathe body parts.
 * - Avoids calling computeVertexNormals() to preserve auto-smooth/bevel data from Blender.
 */
export const optimizeLatheMaterials = (root: Object3D) => {
  root.traverse((child: any) => {
    if (!child.isMesh) {
      return;
    }

    // Note: We deliberately do NOT call computeVertexNormals() here.
    // This preserves the custom split normals and auto-smooth angles exported from Blender.

    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];

    for (const material of materials) {
      if (!material) {
        continue;
      }

      if ("flatShading" in material) {
        material.flatShading = false;
      }

      // Convert Glossiness to Roughness programmatically on the shader level (Roughness = 1.0 - Glossiness).
      // Guard added: if the GLSL string was renamed in super-three@0.181.0, the replace() would
      // silently do nothing and the roughness map would be applied uninverted in XR (materials look
      // rough/matte instead of metallic). The warning makes this failure visible in the console.
      // customProgramCacheKey forces a unique shader variant so Three.js never serves a cached
      // un-patched program when shaders are recompiled on XR session start.
      if (material.roughnessMap) {
        material.onBeforeCompile = (shader: any) => {
          const patched = shader.fragmentShader.replace(
            '#include <roughnessmap_fragment>',
            `
            float roughnessFactor = roughness;
            #ifdef USE_ROUGHNESSMAP
              vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
              // Invert glossiness map to convert it to a roughness map
              roughnessFactor *= ( 1.0 - texelRoughness.g );
            #endif
            `
          );
          if (patched === shader.fragmentShader) {
            console.warn(
              '[optimizeLatheMaterials] Roughness inversion patch did NOT apply — ' +
              'the GLSL string was not found in this version of super-three. ' +
              'Metallic materials may appear too rough/matte in XR.'
            );
          }
          shader.fragmentShader = patched;
        };
        material.customProgramCacheKey = () => 'lathe-glossiness-inverted-v1';
      }

      // Set realistic metallic and roughness values for the lathe's body and parts
      const name = (material.name || "").toLowerCase();
      if (name.includes("lathe_body") || name.includes("lathe_front")) {
        material.metalness = 0.03; // Solid industrial metallic finish
        material.roughness = 1.5;  // Base roughness is multiplied by (1.0 - gloss) in shader
      }

      material.needsUpdate = true;
    }
  });
};

/**
 * Fits the model scale and positions it so that its base sits flat on the floor level.
 */
export const placeModelOnFloor = (root: Object3D, targetMaxDimension: number = 3) => {
  root.scale.set(2, 2, 2);
  root.position.set(0, 0, 0);
  root.updateMatrixWorld(true);

  const bounds = new Box3().setFromObject(root);
  const center = new Vector3();
  const size = new Vector3();
  bounds.getCenter(center);
  bounds.getSize(size);

  const maxDimension = Math.max(size.x, size.y, size.z);
  let scaleFactor = 1;
  if (maxDimension > 0) {
    scaleFactor = targetMaxDimension / maxDimension;
    root.scale.set(scaleFactor, scaleFactor, scaleFactor);
  }

  root.position.x = -center.x * scaleFactor;
  root.position.z = -center.z * scaleFactor;
  root.position.y = -bounds.min.y * scaleFactor;
  root.updateMatrixWorld(true);
};
