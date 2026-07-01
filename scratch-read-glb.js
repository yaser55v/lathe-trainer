import fs from 'fs';

const fileBuffer = fs.readFileSync('public/gltf/wows2.glb');

// GLB header is 12 bytes: magic (4), version (4), length (4)
const magic = fileBuffer.toString('utf8', 0, 4);
const version = fileBuffer.readUInt32LE(4);
const length = fileBuffer.readUInt32LE(8);

console.log("GLB Header:");
console.log("Magic:", magic);
console.log("Version:", version);
console.log("Length:", length);

// First chunk starts at byte 12. Chunk header is 8 bytes: chunkLength (4), chunkType (4)
const chunkLength = fileBuffer.readUInt32LE(12);
const chunkType = fileBuffer.readUInt32LE(16);

// chunkType 0x4E4F534A is 'JSON'
const chunkTypeStr = fileBuffer.toString('utf8', 16, 20);
console.log("Chunk 0 Length:", chunkLength);
console.log("Chunk 0 Type:", chunkTypeStr);

if (chunkTypeStr === 'JSON') {
  const jsonContent = fileBuffer.toString('utf8', 20, 20 + chunkLength);
  const gltf = JSON.parse(jsonContent);
  console.log("\nMaterials in GLTF:");
  if (gltf.materials) {
    gltf.materials.forEach((mat, idx) => {
      console.log(`[Material ${idx}] Name: "${mat.name}"`);
      console.log(JSON.stringify(mat, null, 2));
    });
  } else {
    console.log("No materials found.");
  }
}
